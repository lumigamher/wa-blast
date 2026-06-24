# Inbox rediseño + pulido del agente + envío de media — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulir el agente (typing en WhatsApp, reply citado, debounce preciso), rediseñar el inbox como maestro-detalle persistente (parallel routes, filtros compactos, "🤖 escribiendo…"), y darle al agente la capacidad de enviar cualquier media (biblioteca por org + imágenes de catálogo que ya funcionan).

**Architecture:** Track 1 cablea capacidades ya presentes en `meta/client.ts` (typing/reply) + afina `queue.ts`. Track 3 añade tabla `agent_media_library` + tool `enviar_archivo`. Track 2 reestructura `inbox/` con Next.js parallel routes (`@list` cliente persistente + `@detail` que swapea).

**Tech Stack:** Next.js 15 (App Router, parallel routes), TypeScript, Drizzle (bun:sqlite), Vitest, shadcn/ui, Meta WhatsApp Cloud API.

**Spec:** `docs/superpowers/specs/2026-06-24-inbox-redesign-agente-pulido-design.md`

**Convenciones:** tests `bunx vitest run <ruta>`; typecheck `bunx tsc --noEmit` (borra `.next/types/* 2.ts` si molesta); lint `bun run lint`; build `bun run build` (cliente sin SDK). Commits terminan `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. NO correr dos `deploy.sh` en paralelo; no encadenar `vitest ; deploy` en background.

**Hechos verificados:**
- `meta/client.ts`: `markRead(settings,{wamid,typing:true})` → typing real; `sendText/sendMedia(...,{replyTo})` → cita; `uploadMedia(settings,{bytes,mime,filename})→{mediaId}`; `sendMedia(settings,{to,kind:image|audio|video|document|sticker,mediaId,caption,filename,replyTo})`.
- `media/store.ts`: `saveMediaAsset(db,{orgId,bytes,mime,kind})→asset{id,path,mime}`, `getMediaAsset(db,id)`, `publicMediaUrl(id)`.
- `queue.ts`: debounce reset-por-mensaje; `dispatch.ts` `DEBOUNCE_MS=6000`, `runRealTurn(orgId,convId,phone)` tiene `settings`.
- `enviar-foto-producto.ts`: ya usa `getCatalogProvider` (Medusa/Shopify/interno) + `fetchImageBytes` (assets locales y URLs externas) → imágenes de catálogo de integraciones YA se envían.
- Inbox hoy: `inbox/page.tsx` (lista, grid `md:grid-cols-[320px_1fr]`) + `inbox/[id]/page.tsx` (detalle separado). `ConversationListItem` en `store.ts:252`; `listConversations` opts ya incluye `agent`/`labelId`.

---

## Task 1: Migración aditiva — `agentTypingUntil` + `agent_media_library`

**Files:** Modify `src/lib/db/schema/domain.ts`; migración en `drizzle/`.

- [ ] **Step 1:** En `domain.ts`, añade a la tabla `conversations` la columna:
```ts
  agentTypingUntil: integer("agent_typing_until", { mode: "timestamp" }),
```
y al final del archivo:
```ts
export const agentMediaLibrary = sqliteTable("agent_media_library", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["image", "video", "document"] }).notNull(),
  mediaAssetId: text("media_asset_id").notNull(),
  label: text("label").notNull(),
  productId: text("product_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```
- [ ] **Step 2:** `bun run db:generate` → verifica que el nuevo `drizzle/migrations/*.sql` solo AÑADE (ALTER TABLE add column + CREATE TABLE agent_media_library), sin DROP. `bun run db:migrate`. `bunx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(db): agentTypingUntil + tabla agent_media_library`.

---

## Task 2: `agentTypingUntil` en el store + helper `setAgentTyping`

**Files:** Modify `src/lib/inbox/store.ts`, `src/lib/agent/pause.ts`; tests correspondientes.

- [ ] **Step 1: Write failing test** en `src/lib/agent/pause.test.ts`:
```ts
it("setAgentTyping setea y limpia el timestamp", async () => {
  const { db } = makeTestDb();
  // seed org o1 + conversación c1
  const until = new Date(Date.now() + 30000);
  await setAgentTyping(db, "c1", until);
  // leer vía store o select directo y comprobar agentTypingUntil ~ until
  await setAgentTyping(db, "c1", null);
  // comprobar null
});
```
(usa el seed del archivo; comprueba el valor leyendo `conversations.agentTypingUntil`.)
- [ ] **Step 2:** Run red.
- [ ] **Step 3: Implementación.** En `src/lib/agent/pause.ts`:
```ts
export async function setAgentTyping(db: DB, conversationId: string, until: Date | null): Promise<void> {
  await db.update(conversations).set({ agentTypingUntil: until }).where(eq(conversations.id, conversationId));
}
```
En `src/lib/inbox/store.ts`: añade `agentTypingUntil: Date | null;` a `ConversationListItem` y `agentTypingUntil: conversations.agentTypingUntil,` al `.select({...})` de `listConversations`. (Para el detalle, `getThread` ya hace `select()` completo.)
- [ ] **Step 4:** Run green + `bunx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(inbox): agentTypingUntil en store + setAgentTyping`.

---

## Task 3: Cablear typing(WhatsApp) + reply citado + debounce

**Files:** Modify `src/lib/agent/dispatch.ts`, `src/lib/agent/turn.ts`; tests.

- [ ] **Step 1:** READ `dispatch.ts` y `turn.ts` (firma de `AgentSender`, cómo `runRealTurn` arma el sender, cómo `turn.ts` envía el reply y registra el run).
- [ ] **Step 2: Debounce** en `dispatch.ts`: `const DEBOUNCE_MS = Number(process.env.AGENT_DEBOUNCE_MS ?? 8000);`.
- [ ] **Step 3: Typing WhatsApp + agentTypingUntil** en `dispatch.ts` `runRealTurn`, ANTES de `runAgentTurn`:
```ts
import { markRead } from "@/lib/meta/client";
import { setAgentTyping } from "@/lib/agent/pause";
import { messages } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
// ...dentro de runRealTurn, con `settings` ya disponible:
  const [lastIn] = await defaultDb.select({ wamid: messages.wamid })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, "in")))
    .orderBy(desc(messages.createdAt)).limit(1);
  if (lastIn?.wamid && creds) { await markRead(settings, { wamid: lastIn.wamid, typing: true }).catch(() => {}); }
  await setAgentTyping(defaultDb, conversationId, new Date(Date.now() + 30_000)).catch(() => {});
```
(usa los nombres reales de columnas `messages.direction`/`messages.wamid` — verifícalos en el schema; el valor de dirección entrante puede ser `"in"`/`"inbound"`.)
- [ ] **Step 4: Reply citado.** En `turn.ts`: computa `lastInboundWamid` (del historial/DB, igual que arriba) y al enviar el reply pásalo: el `AgentSender` gana `replyTo?: string`; `turn.ts` llama `deps.sender({ to, body, replyTo: lastInboundWamid })`. En `dispatch.ts` el sender pasa `replyTo` a `sendText`. Tras enviar el reply (éxito o no), limpiar typing: `await setAgentTyping(defaultDb, conversationId, null)` — hazlo en `dispatch.runRealTurn` en un `finally` alrededor de `runAgentTurn`, para cubrir éxito y error.
- [ ] **Step 5: Tests** (mocks): en `dispatch.test.ts`/`turn.test.ts` — el sender recibe `replyTo` = wamid del último entrante; `setAgentTyping` se llama con fecha futura al inicio y con `null` al final; el debounce sigue coalesciendo (un turno tras varios mensajes — ya cubierto, no romper). Run green + tsc + lint.
- [ ] **Step 6:** Commit `feat(agent): typing en WhatsApp + reply citado + debounce 8s configurable`.

---

## Task 4: Biblioteca de media — capa `media-library.ts`

**Files:** Create `src/lib/agent/media-library.ts`, `src/lib/agent/media-library.test.ts`.

- [ ] **Step 1: Write failing test** (`makeTestDb` + seed org):
```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { addMedia, listMedia, findMedia, deleteMedia } from "./media-library";

async function seed(db: any) { await db.insert(organization).values({ id: "o1", name: "O", slug: "o1", createdAt: new Date() }).onConflictDoNothing(); }

describe("media library", () => {
  it("add/list/find/delete scoped por org", async () => {
    const { db } = makeTestDb(); await seed(db);
    const id = await addMedia(db, "o1", { kind: "document", mediaAssetId: "media_x", label: "Catálogo PDF" });
    expect((await listMedia(db, "o1")).length).toBe(1);
    expect((await findMedia(db, "o1", "catalogo"))?.id).toBe(id);
    expect(await findMedia(db, "o1", "noexiste")).toBeNull();
    await deleteMedia(db, "o1", id);
    expect((await listMedia(db, "o1")).length).toBe(0);
  });
  it("listMedia filtra por productId", async () => {
    const { db } = makeTestDb(); await seed(db);
    await addMedia(db, "o1", { kind: "video", mediaAssetId: "m1", label: "Demo", productId: "p1" });
    await addMedia(db, "o1", { kind: "image", mediaAssetId: "m2", label: "Otra" });
    expect((await listMedia(db, "o1", { productId: "p1" })).length).toBe(1);
  });
});
```
- [ ] **Step 2:** Run red.
- [ ] **Step 3: Implementación** `src/lib/agent/media-library.ts`:
```ts
import { randomUUID } from "node:crypto";
import { and, eq, like, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentMediaLibrary } from "@/lib/db/schema";

export type MediaKind = "image" | "video" | "document";
export type MediaItem = { id: string; kind: MediaKind; mediaAssetId: string; label: string; productId: string | null };

export async function addMedia(db: DB, orgId: string, input: { kind: MediaKind; mediaAssetId: string; label: string; productId?: string | null }): Promise<string> {
  const label = input.label.trim();
  if (!label) throw new Error("Etiqueta requerida");
  const id = randomUUID();
  await db.insert(agentMediaLibrary).values({ id, orgId, kind: input.kind, mediaAssetId: input.mediaAssetId, label, productId: input.productId ?? null, createdAt: new Date() });
  return id;
}
export async function listMedia(db: DB, orgId: string, opts?: { productId?: string }): Promise<MediaItem[]> {
  const conds = [eq(agentMediaLibrary.orgId, orgId)];
  if (opts?.productId) conds.push(eq(agentMediaLibrary.productId, opts.productId));
  return db.select({ id: agentMediaLibrary.id, kind: agentMediaLibrary.kind, mediaAssetId: agentMediaLibrary.mediaAssetId, label: agentMediaLibrary.label, productId: agentMediaLibrary.productId })
    .from(agentMediaLibrary).where(and(...conds)).orderBy(agentMediaLibrary.label);
}
export async function findMedia(db: DB, orgId: string, query: string): Promise<MediaItem | null> {
  const q = `%${query.trim().toLowerCase()}%`;
  const rows = await db.select({ id: agentMediaLibrary.id, kind: agentMediaLibrary.kind, mediaAssetId: agentMediaLibrary.mediaAssetId, label: agentMediaLibrary.label, productId: agentMediaLibrary.productId })
    .from(agentMediaLibrary).where(and(eq(agentMediaLibrary.orgId, orgId), like(sql`lower(${agentMediaLibrary.label})`, q))).limit(1);
  return rows[0] ?? null;
}
export async function deleteMedia(db: DB, orgId: string, id: string): Promise<void> {
  await db.delete(agentMediaLibrary).where(and(eq(agentMediaLibrary.id, id), eq(agentMediaLibrary.orgId, orgId)));
}
```
- [ ] **Step 4:** Run green + tsc. Commit `feat(agent): capa de biblioteca de media por org`.

---

## Task 5: Tool `enviar_archivo` + helper mime→kind

**Files:** Create `src/lib/agent/tools/builtin/enviar-archivo.ts`, test; Modify `src/lib/agent/tools/registry.ts`.

- [ ] **Step 1:** READ `enviar-foto-producto.ts` (patrón uploadMedia/sendMedia/getMediaAsset/readFile + guard org) y `registry.ts` (cómo se registra una builtin tool).
- [ ] **Step 2: Write failing test** `enviar-archivo.test.ts`: mockea `getOrgSettings`, `getMediaAsset`, `readFile`, `uploadMedia`, `sendMedia`; seed un item de biblioteca; verifica que `enviar_archivo({query:"catálogo"})` resuelve el item, sube y llama `sendMedia` con `kind:"document"` (el del item) y al teléfono de la conversación; item de otra org → no se envía; sin item → `{ok:false}`. (sigue el estilo de los tests de tools si existen.)
- [ ] **Step 3:** Run red.
- [ ] **Step 4: Implementación** `enviar-archivo.ts` (espeja `enviar-foto-producto`):
```ts
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { uploadMedia, sendMedia } from "@/lib/meta/client";
import { getOrgSettings } from "@/lib/org/settings";
import { getMediaAsset } from "@/lib/media/store";
import { conversations } from "@/lib/db/schema";
import { findMedia, listMedia } from "@/lib/agent/media-library";
import type { AgentTool } from "../types";

const schema = z.object({ query: z.string().optional(), mediaId: z.string().optional(), productId: z.string().optional() });

export const enviarArchivo: AgentTool = {
  name: "enviar_archivo",
  description: "Envía al cliente un archivo (imagen, video o documento) de la biblioteca de la empresa por WhatsApp. Úsalo cuando piden el catálogo, una ficha técnica, un video, etc.",
  paramsSchema: schema,
  jsonSchema: { type: "object", properties: { query: { type: "string", description: "Qué archivo enviar (ej: 'catálogo', 'ficha técnica')" }, productId: { type: "string", description: "Producto asociado (opcional)" } } },
  escalates: false,
  async run(args, ctx) {
    const { query, mediaId, productId } = schema.parse(args);
    let item = null as Awaited<ReturnType<typeof findMedia>>;
    if (mediaId) { const all = await listMedia(ctx.db, ctx.orgId, productId ? { productId } : undefined); item = all.find((m) => m.id === mediaId) ?? null; }
    else if (query) item = await findMedia(ctx.db, ctx.orgId, query);
    if (!item) return { ok: false, error: "No encontré ese archivo en la biblioteca." };

    const asset = await getMediaAsset(ctx.db, item.mediaAssetId);
    if (!asset || asset.orgId !== ctx.orgId) return { ok: false, error: "Archivo no disponible." };

    const [conv] = await ctx.db.select({ phone: conversations.phone }).from(conversations).where(eq(conversations.id, ctx.conversationId));
    if (!conv?.phone) return { ok: false, error: "Conversación sin teléfono." };

    const settings = await getOrgSettings(ctx.db, ctx.orgId);
    let bytes: ArrayBuffer;
    try { const buf = await readFile(asset.path); bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer; }
    catch { return { ok: false, error: "No pude leer el archivo." }; }

    const up = await uploadMedia(settings, { bytes, mime: asset.mime, filename: item.label });
    if ("error" in up) return { ok: false, error: "No pude subir el archivo a WhatsApp." };
    const res = await sendMedia(settings, { to: conv.phone, kind: item.kind, mediaId: up.mediaId, filename: item.kind === "document" ? item.label : undefined });
    if ("error" in res) return { ok: false, error: "No pude enviar el archivo." };
    return { ok: true, data: { sent: item.label } };
  },
};
```
- [ ] **Step 5:** Regístrala en `registry.ts` (`BUILTIN_TOOLS`): `enviar_archivo: enviarArchivo,` (+ import). Run green + tsc.
- [ ] **Step 6:** Commit `feat(agent): tool enviar_archivo (biblioteca de media)`.

---

## Task 6: Subida + panel "Biblioteca"

**Files:** Create `src/app/api/agent/media-library/route.ts` (POST upload + DELETE); Modify the catálogo config page/area to add a "Biblioteca" section with dropzone. READ the product-image upload route (`src/app/api/products/[id]/images/route.ts`) and an existing dropzone component for the pattern.

- [ ] **Step 1:** Endpoint `POST /api/agent/media-library` (formData: file, label, productId?): `requireOrg`, validar tamaño (MAX 16MB para video/doc), `saveMediaAsset(db,{orgId,bytes,mime,kind})` con `kind` derivado del mime (image/* → image, video/* → video, resto → document), `addMedia(...)`. `DELETE` con `{id}` → `deleteMedia`. Espeja el patrón del route de imágenes de producto.
- [ ] **Step 2:** Helper `mimeToKind(mime: string): "image"|"video"|"document"` en `src/lib/agent/media-library.ts` (export) + test (`image/png`→image, `video/mp4`→video, `application/pdf`→document). Úsalo en el endpoint.
- [ ] **Step 3:** UI: en `src/app/(app)/configuracion/agente/catalogo/page.tsx` (o nueva sub-ruta `catalogo` sección) añade un bloque "Biblioteca de archivos" (client component `_media-library.tsx`): dropzone multi-archivo (reusa el patrón del dropzone de productos/RAG), input de etiqueta, lista con kind + label + borrar. Usa el endpoint. Carga inicial vía `listMedia(db, orgId)` en el server component.
- [ ] **Step 4:** `bunx tsc --noEmit && bun run build` (cliente sin SDK). Commit `feat(agent-ui): biblioteca de archivos (subir/listar/borrar) + endpoint`.

---

## Task 7: Inbox maestro-detalle (parallel routes) + list pane cliente + filtros compactos

**Files:** Create `src/app/(app)/inbox/layout.tsx`, `inbox/@list/default.tsx`, `inbox/@detail/default.tsx`, `inbox/@detail/[id]/page.tsx`, `inbox/_components/conversation-list-pane.tsx`; Modify `inbox/actions.ts` (server action `getInboxData`), `inbox/page.tsx`. Move detalle desde `inbox/[id]/page.tsx`.

> Esta es la tarea estructural. READ `inbox/page.tsx` y `inbox/[id]/page.tsx` COMPLETOS antes de tocar. El objetivo: la LISTA vive en un slot `@list` que NO se re-renderiza al abrir una conversación; solo `@detail` swapea.

- [ ] **Step 1: Server action `getInboxData`** en `inbox/actions.ts`:
```ts
import { listConversations } from "@/lib/inbox/store";
import { labelsByConversation, listLabels } from "@/lib/inbox/labels";
import { getAgentConfig } from "@/lib/agent/config";
export async function getInboxData(filters: { q?: string; unreadOnly?: boolean; status?: "open"|"resolved"|"all"; agent?: "ia"|"humano"|"all"; labelId?: string }) {
  const { orgId } = await requireOrg();
  const conversations = await listConversations(db, orgId, filters);
  const labelsMap = await labelsByConversation(db, orgId, conversations.map((c) => c.id));
  const labels = await listLabels(db, orgId);
  const { enabled } = await getAgentConfig(db, orgId);
  return { conversations: conversations.map((c) => ({ ...c, labels: labelsMap[c.id] ?? [] })), labels, agentEnabled: enabled };
}
```
- [ ] **Step 2: `ConversationListPane`** (`inbox/_components/conversation-list-pane.tsx`, `"use client"`): lee `useSearchParams()` (q/status/unreadOnly/agent/label), llama `getInboxData` en un `useEffect`/`useTransition` al montar y cuando cambian los filtros; pinta la **barra de filtros compacta** (search; segmented estado; toggles 🤖 IA/🧑 Humano/•No leídas solo si `agentEnabled`; dropdown 🏷 Etiqueta) que actualizan la URL con `router.replace(\`/inbox?${params}\`, { scroll: false })`; pinta filas como `<Link href={\`/inbox/${c.id}\`}>` con `AgentBadge`, `LabelChips`, y "🤖 escribiendo…" si `c.agentTypingUntil && new Date(c.agentTypingUntil) > new Date()`; resalta la activa con `usePathname()`. NO importa SDK.
- [ ] **Step 3: Slots.** `inbox/layout.tsx`:
```tsx
export default function InboxLayout({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex w-full shrink-0 flex-col border-r md:w-[340px]" data-pane="list">{list}</div>
      <div className="hidden min-h-0 flex-1 md:flex" data-pane="detail">{detail}</div>
    </div>
  );
}
```
`inbox/@list/default.tsx` → `export default function L(){ return <ConversationListPane/>; }`.
`inbox/@detail/default.tsx` → estado vacío ("Selecciona una conversación").
`inbox/page.tsx` → `export default function Page(){ return null; }` (el contenido vive en los slots).
- [ ] **Step 4: Mover el detalle.** Copia el contenido de `inbox/[id]/page.tsx` a `inbox/@detail/[id]/page.tsx` (mismos imports a `[id]/_components/*` — ajusta rutas relativas: los `_components` siguen en `inbox/[id]/_components/`, así que importa con ruta absoluta `@/app/(app)/inbox/[id]/_components/...` o mueve `_components` a `@detail/[id]/_components`). Elimina `inbox/[id]/page.tsx`. Verifica que el detalle renderiza igual.
- [ ] **Step 5:** `bunx tsc --noEmit && bun run build` (DEBE pasar; valida parallel routes + sin SDK en cliente). Commit `feat(inbox): maestro-detalle persistente (parallel routes) + list pane cliente + filtros compactos`.

---

## Task 8: Responsive (móvil) + ajuste del poller

**Files:** Modify `inbox/layout.tsx`, `inbox/@detail/[id]/page.tsx` (header con "volver"), `inbox/_components/poller.tsx`.

- [ ] **Step 1: Responsive.** En móvil mostrar un panel a la vez: cuando hay `[id]` activo, el panel lista se oculta y el detalle ocupa todo; botón "←" en el header del detalle (`<Link href="/inbox">`). Logralo con clases responsive sobre los `data-pane` (usar `usePathname` en un pequeño wrapper cliente del layout para saber si hay detalle activo, o CSS: en `md:` ambos; en móvil, mostrar detalle si la ruta es `/inbox/[id]`). Implementa con un client wrapper que lee `usePathname()` y togglea clases.
- [ ] **Step 2: Poller.** READ `inbox/_components/poller.tsx`. Si hoy hace `router.refresh()` global (recarga todo incl. detalle), cámbialo para que dispare un refetch del `ConversationListPane` (ej. un evento/estado compartido o que el poller viva dentro del pane y llame `getInboxData`). Objetivo: el polling refresca la lista (nuevos mensajes/typing) sin recargar el panel de detalle.
- [ ] **Step 3:** `bunx tsc --noEmit && bun run build`. Commit `feat(inbox): responsive móvil + poller refresca solo la lista`.

---

## Task 9: Verificación final + en vivo

- [ ] **Step 1:** `find .next/types -name "* 2.ts" -delete; bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build` → todo verde/pasa.
- [ ] **Step 2:** Merge a `main`, deploy (`bash deploy/deploy.sh`, migración aditiva, health 200). UN solo deploy, sin paralelos.
- [ ] **Step 3 (en vivo, org luis 49644ae3 + El Man):**
  - Inbox: abrir varias conversaciones → la **lista no se recarga**, los filtros **persisten**, scroll se mantiene. Filtros compactos funcionan (IA/Humano/etiqueta/estado/búsqueda).
  - Agente: enviar varios mensajes seguidos por WhatsApp → **una** respuesta tras el silencio (debounce); ver "**escribiendo…**" en WhatsApp y "🤖 escribiendo…" en la UI; la respuesta **cita** el mensaje.
  - Media: subir un PDF a la Biblioteca etiquetado "catálogo"; pedirle al agente "mándame el catálogo" → llega el PDF por WhatsApp. Pedir foto de un teclado → llega la imagen (de Medusa).

---

## Self-Review (cobertura del spec)

- **Track 1**: typing WA + reply (Task 3), debounce (Task 3), agentTypingUntil dato (Task 1/2), UI typing (Task 7). ✓
- **Track 2**: parallel routes + list pane cliente persistente (Task 7), filtros compactos (Task 7), responsive + poller (Task 8), limpieza *_2.tsx (hecho al crear rama). ✓
- **Track 3**: tabla + capa (Task 1/4), tool enviar_archivo + mime→kind (Task 5), endpoint + panel Biblioteca (Task 6); imágenes de catálogo de integraciones ya funcionan (enviar_foto_producto, documentado). ✓
- **Migración aditiva** (Task 1). ✓
- **Tipos consistentes**: `MediaItem{id,kind,mediaAssetId,label,productId}` (Task 4) usado en Task 5/6; `getInboxData` devuelve `conversations` con `labels`+`agentTypingUntil` (Task 1/2/7); `setAgentTyping(db,convId,Date|null)` (Task 2) usado en Task 3; `AgentSender` gana `replyTo` (Task 3). ✓
- **GOTCHAs**: bundle (build en Tasks 6/7/8), deploy no-paralelo (Task 9), iCloud `* 2.ts`. ✓
