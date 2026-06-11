# Conexión Meta simplificada + Inbox completo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Steps use checkbox syntax.

**Goal:** Onboarding Meta con verify token auto-generado + copy-paste, e inbox con respuestas rápidas, marcar-leído/typing, media, citar y reacciones (todo lo que la Cloud API permite).

**Architecture:** Unidades aisladas para paralelizar. Tres tracks independientes (A: meta client lib methods; B: quick_replies schema+store; C: conexión Meta UI+verify token) se construyen en paralelo; luego D (inbox actions) integra A+B y E (inbox UI) integra todo. Secuencial solo donde hay dependencia real de archivos.

**Tech Stack:** Next 16 App Router (Node), Drizzle/better-sqlite3, Vitest, WhatsApp Cloud API v22.0.

**Spec:** `docs/superpowers/specs/2026-06-11-meta-onboarding-inbox-pro-design.md`

**Convenciones:** `bun run test` (vitest, makeTestDb); matar next-server stale; borrar `"* 2.*"`; commits español; push autorizado; deploy `deploy/deploy.sh` (wrapper ssh llave 2026-05-01). ⚠️ NEXT_PUBLIC_* se inlinea en build. ⚠️ /shots y rutas públicas en proxy si aplica.

**Paralelización:** Tasks 1, 2, 3 tocan archivos DISJUNTOS → se ejecutan en paralelo. Task 4 depende de 1+2. Task 5 depende de 4. Task 6 = review+deploy.

---

### Task 1 (TRACK A): Métodos Meta client — markRead+typing, media, reacción

**Files:** Modify `src/lib/meta/client.ts` · Test `tests/unit/meta-client-inbox.test.ts`

Patrón base (copiar de `sendText`/`sendTemplate` ya en el archivo): cada fn recibe `settings: DecryptedSettings`, valida `metaPhoneId`/`metaAccessToken` (return `{error:{code:0,message:"Meta creds not configured",type:"auth"}}` si faltan), hace `fetch` a `https://graph.facebook.com/v22.0/...`, en `!res.ok` usa el `classify(body.error?.code, body.error?.message)` existente.

- [ ] **Step 1: Tests primero** `tests/unit/meta-client-inbox.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { markRead, sendMedia, sendReaction, uploadMedia } from "@/lib/meta/client";

const settings = { metaPhoneId: "PHONE1", metaAccessToken: "TOK" } as any;
afterEach(() => vi.restoreAllMocks());

describe("meta client inbox methods", () => {
  it("markRead manda status read + typing_indicator", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const r = await markRead(settings, { wamid: "wamid.X", typing: true });
    expect(r).toEqual({ ok: true });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ messaging_product: "whatsapp", status: "read", message_id: "wamid.X", typing_indicator: { type: "text" } });
    expect(String(mock.mock.calls[0][0])).toContain("/PHONE1/messages");
  });

  it("markRead sin typing omite typing_indicator", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await markRead(settings, { wamid: "w1" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body.typing_indicator).toBeUndefined();
  });

  it("uploadMedia sube bytes y devuelve media_id", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "MEDIA99" }), { status: 200 }));
    const r = await uploadMedia(settings, { bytes: new ArrayBuffer(8), mime: "image/png", filename: "x.png" });
    expect(r).toEqual({ mediaId: "MEDIA99" });
    expect(String(mock.mock.calls[0][0])).toContain("/PHONE1/media");
  });

  it("sendMedia arma type image con media_id y caption", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] }), { status: 200 }));
    const r = await sendMedia(settings, { to: "+573001112233", kind: "image", mediaId: "MEDIA99", caption: "mira" });
    expect(r).toEqual({ wamid: "wamid.OUT" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ type: "image", image: { id: "MEDIA99", caption: "mira" } });
    expect(body.to).toBe("573001112233");
  });

  it("sendMedia con replyTo incluye context", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 }));
    const r = await sendMedia(settings, { to: "+57300", kind: "document", mediaId: "M", replyTo: "wamid.PREV" });
    expect("wamid" in r).toBe(true);
  });

  it("sendReaction arma type reaction", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 }));
    await sendReaction(settings, { to: "+573001112233", wamid: "wamid.MSG", emoji: "👍" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ type: "reaction", reaction: { message_id: "wamid.MSG", emoji: "👍" } });
  });

  it("error de Meta se clasifica", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: 131047, message: "re-engagement" } }), { status: 400 }));
    const r = await sendMedia(settings, { to: "+57300", kind: "image", mediaId: "M" });
    expect("error" in r && r.error.type).toBe("outside_24h");
  });
});
```

- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implementar en `client.ts` (añadir al final, antes de `classify`):

```typescript
export async function markRead(
  settings: DecryptedSettings,
  p: { wamid: string; typing?: boolean },
): Promise<{ ok: true } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const body: Record<string, unknown> = { messaging_product: "whatsapp", status: "read", message_id: p.wamid };
  if (p.typing) body.typing_indicator = { type: "text" };
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  return { ok: true };
}

export async function uploadMedia(
  settings: DecryptedSettings,
  p: { bytes: ArrayBuffer; mime: string; filename?: string },
): Promise<{ mediaId: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([p.bytes], { type: p.mime }), p.filename ?? "upload");
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}` },
    body: form,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  const j = (await res.json()) as { id: string };
  return { mediaId: j.id };
}

export async function sendMedia(
  settings: DecryptedSettings,
  p: { to: string; kind: "image" | "audio" | "video" | "document"; mediaId: string; caption?: string; filename?: string; replyTo?: string },
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const media: Record<string, unknown> = { id: p.mediaId };
  if (p.caption && (p.kind === "image" || p.kind === "video" || p.kind === "document")) media.caption = p.caption;
  if (p.filename && p.kind === "document") media.filename = p.filename;
  const body: Record<string, unknown> = { messaging_product: "whatsapp", to: p.to.replace(/^\+/, ""), type: p.kind, [p.kind]: media };
  if (p.replyTo) body.context = { message_id: p.replyTo };
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  const j = (await res.json()) as { messages: { id: string }[] };
  return { wamid: j.messages[0].id };
}

export async function sendReaction(
  settings: DecryptedSettings,
  p: { to: string; wamid: string; emoji: string },
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: p.to.replace(/^\+/, ""), type: "reaction", reaction: { message_id: p.wamid, emoji: p.emoji } }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  const j = (await res.json()) as { messages: { id: string }[] };
  return { wamid: j.messages[0].id };
}
```

- [ ] **Step 4:** Run → pass. `bunx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(meta): client markRead+typing, uploadMedia, sendMedia, sendReaction`.

---

### Task 2 (TRACK B): Tabla quick_replies + store (TDD)

**Files:** Modify `src/lib/db/schema/domain.ts` · Create `src/lib/inbox/quick-replies.ts` · Test `tests/unit/quick-replies.test.ts` · migración

- [ ] **Step 1:** Añadir a domain.ts (estilo del archivo):

```typescript
export const quickReplies = sqliteTable("quick_replies", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  shortcut: text("shortcut").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [index("quick_replies_org").on(t.orgId)]);
```

`bun run db:generate` (migración nueva).

- [ ] **Step 2: Tests** `tests/unit/quick-replies.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { createQuickReply, deleteQuickReply, listQuickReplies } from "@/lib/inbox/quick-replies";

async function seed(db: any, id = "o1") {
  await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
}
describe("quick replies", () => {
  it("crear + listar por org", async () => {
    const { db } = makeTestDb(); await seed(db);
    await createQuickReply(db, "o1", { shortcut: "saludo", body: "¡Hola! ¿En qué te ayudo?" });
    const rows = await listQuickReplies(db, "o1");
    expect(rows.length).toBe(1);
    expect(rows[0].shortcut).toBe("saludo");
  });
  it("aislamiento por org", async () => {
    const { db } = makeTestDb(); await seed(db, "o1"); await seed(db, "o2");
    await createQuickReply(db, "o1", { shortcut: "a", body: "A" });
    expect((await listQuickReplies(db, "o2")).length).toBe(0);
  });
  it("eliminar respeta org", async () => {
    const { db } = makeTestDb(); await seed(db, "o1"); await seed(db, "o2");
    const r = await createQuickReply(db, "o1", { shortcut: "x", body: "X" });
    await deleteQuickReply(db, "o2", r.id); // org equivocada → no borra
    expect((await listQuickReplies(db, "o1")).length).toBe(1);
    await deleteQuickReply(db, "o1", r.id);
    expect((await listQuickReplies(db, "o1")).length).toBe(0);
  });
  it("rechaza shortcut/body vacíos", async () => {
    const { db } = makeTestDb(); await seed(db);
    await expect(createQuickReply(db, "o1", { shortcut: "", body: "x" })).rejects.toThrow();
    await expect(createQuickReply(db, "o1", { shortcut: "a", body: "" })).rejects.toThrow();
  });
});
```

- [ ] **Step 3:** Implementar `src/lib/inbox/quick-replies.ts`:

```typescript
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { quickReplies } from "@/lib/db/schema";

export async function listQuickReplies(db: DB, orgId: string) {
  return db.select().from(quickReplies).where(eq(quickReplies.orgId, orgId)).orderBy(quickReplies.shortcut);
}
export async function createQuickReply(db: DB, orgId: string, input: { shortcut: string; body: string }) {
  if (!input.shortcut.trim() || !input.body.trim()) throw new Error("Shortcut y mensaje son obligatorios");
  const row = { id: randomUUID(), orgId, shortcut: input.shortcut.trim(), body: input.body.trim(), createdAt: new Date() };
  await db.insert(quickReplies).values(row);
  return row;
}
export async function deleteQuickReply(db: DB, orgId: string, id: string) {
  await db.delete(quickReplies).where(and(eq(quickReplies.id, id), eq(quickReplies.orgId, orgId)));
}
```

- [ ] **Step 4:** Run → pass. tsc.
- [ ] **Step 5:** Commit `feat(inbox): tabla y store de respuestas rápidas`.

---

### Task 3 (TRACK C): Conexión Meta — verify token auto + UI copy-paste

**Files:** Modify `src/lib/org/settings.ts` (helper) · `src/app/(app)/configuracion/meta/page.tsx` (rediseño) · `src/app/(app)/configuracion/meta/actions.ts` (si existe; si no, donde viva saveMetaCreds) · Create `_components/copy-field.tsx` · Test `tests/unit/verify-token.test.ts`

- [ ] **Step 1: Test** `tests/unit/verify-token.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, organizationSettings } from "@/lib/db/schema";
import { ensureVerifyToken } from "@/lib/org/settings";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(organizationSettings).values({ orgId: "o1", updatedAt: new Date() });
}
describe("ensureVerifyToken", () => {
  it("genera token si falta y es idempotente", async () => {
    const { db } = makeTestDb(); await seed(db);
    const t1 = await ensureVerifyToken(db, "o1");
    expect(t1).toMatch(/^lula_[0-9a-f]{16}$/);
    const t2 = await ensureVerifyToken(db, "o1");
    expect(t2).toBe(t1); // no regenera
  });
});
```

- [ ] **Step 2:** Run → fail. Implementar `ensureVerifyToken` en `src/lib/org/settings.ts`:

```typescript
import { randomBytes } from "node:crypto"; // (si no está importado)
export async function ensureVerifyToken(db: DB, orgId: string): Promise<string> {
  const row = (await db.select().from(organizationSettings).where(eq(organizationSettings.orgId, orgId)))[0];
  if (row?.metaVerifyToken) return row.metaVerifyToken;
  const token = `lula_${randomBytes(8).toString("hex")}`;
  await db.update(organizationSettings).set({ metaVerifyToken: token, updatedAt: new Date() }).where(eq(organizationSettings.orgId, orgId));
  return token;
}
```

(usar los imports `eq`, `organizationSettings`, `DB` que el archivo ya tiene). Run → pass.

- [ ] **Step 3:** `_components/copy-field.tsx` ("use client"): label + valor monoespaciado + botón "Copiar" (`navigator.clipboard.writeText`, feedback "✓ Copiado" 2s). Reduced-motion no aplica.

- [ ] **Step 4:** Rediseñar `configuracion/meta/page.tsx` (server): al cargar, `const verifyToken = await ensureVerifyToken(db, orgId)`. Estructura:
  - Sección 1 "Conecta tu WhatsApp" (destacada): `<CopyField label="Webhook URL" value={`${PUBLIC_BASE_URL}/api/webhook/meta`} />` + `<CopyField label="Verify token" value={verifyToken} />` + lista ordenada de 3 pasos (1. En Meta → tu App → WhatsApp → Configuration. 2. En Webhooks pega la URL y el token, dale Verify and Save. 3. Suscríbete al campo `messages`). Usar PUBLIC_BASE_URL o BETTER_AUTH_URL del env.
  - Sección 2 "Tus credenciales de Meta" (lo que solo Meta da): los 4 Field existentes Access Token, Phone Number ID, WABA ID, App Secret (quitar el Field manual de Verify Token — ya es auto). Mantener saveMetaCreds.
  - Sección 3 "Probar conexión": botón que llama una action `testConnectionAction` que usa `/api/meta/test-connection` o llama directo a Graph `GET /{phoneId}?fields=verified_name` con el token guardado, devolviendo `{ok, name?}|{error}`. Mostrar ✓ nombre / ✗ error (client component pequeño con useActionState).
  - Conservar la sección de Forward URL y opt-out keywords existentes.

- [ ] **Step 5:** tsc + lint + build. Commit `feat(meta): verify token auto-generado + UI copy-paste y probar conexión`.

---

### Task 4 (DEPENDE 1+2): Inbox actions — leído/typing real, media, reacción, citar, canned

**Files:** Modify `src/app/(app)/inbox/actions.ts` · Modify `src/lib/inbox/store.ts` (helper para último wamid entrante si falta) · Test `tests/integration/inbox-actions.test.ts`

- [ ] **Step 1:** En store.ts, si no existe, añadir `getLastInboundWamid(db, orgId, conversationId)` → string|null (último message direction "in" con wamid). Test rápido incluido.
- [ ] **Step 2:** `markReadAction(conversationId)`: tras `markConversationRead` local, obtener settings + último wamid entrante; si hay, `markRead(settings, {wamid, typing:true})` best-effort (try/catch, no romper si falla). 
- [ ] **Step 3:** `sendMediaAction(conversationId, {kind, dataBase64, mime, filename, caption, replyTo})`: gate suscripción + getThread; `uploadMedia` → `sendMedia`; registra out con type=kind, body=caption||"[media]"; en fallo registra failed. (El archivo llega como base64 desde el client; decodificar a ArrayBuffer.)
- [ ] **Step 4:** `sendReactionAction(conversationId, {wamid, emoji})`: gate + getThread + `sendReaction`; registra un message type=reaction body=emoji (o actualiza el mensaje objetivo — simple: registra una línea).
- [ ] **Step 5:** `sendMessageAction` acepta `replyTo?` opcional → pásalo a `sendText` (añadir param `context` a sendText o nueva variante; si sendText no soporta context, extenderlo igual que sendMedia con replyTo→context). Mantén firma retrocompatible.
- [ ] **Step 6:** Tests de integración con fetch mock para Meta: markReadAction llama Meta con el último wamid; sendMediaAction registra out; gate sin suscripción bloquea; aislamiento. Run verde, tsc.
- [ ] **Step 7:** Commit `feat(inbox): acciones de leído/typing real, media, reacción y citar`.

---

### Task 5 (DEPENDE 4): UI inbox + CRUD respuestas rápidas

**Files:** Modify `src/app/(app)/inbox/[id]/_components/{composer,thread}.tsx` · Create `src/app/(app)/configuracion/respuestas/{page.tsx,actions.ts,_form.tsx}` · Modify `src/app/(app)/configuracion` nav si aplica

- [ ] **Step 1:** `/configuracion/respuestas`: page (server, lista quickReplies) + actions (createQuickReplyAction/deleteQuickReplyAction con requireOrg) + _form client (shortcut + body + crear; lista con borrar). Link desde configuración.
- [ ] **Step 2:** Composer: prop `quickReplies` (el server de [id]/page los carga con listQuickReplies). Detectar `/` al inicio del textarea → dropdown filtrable; al elegir, inserta el body. Botón **adjuntar** (input file image/audio/video/pdf) → lee a base64 → `sendMediaAction` con preview optimista. Estado "respondiendo a" (citar) con chip cancelable → pasa replyTo a sendMessageAction.
- [ ] **Step 3:** Thread: cada burbuja con menú (Responder, Reaccionar con picker de emojis básicos 👍❤️😂😮🙏). Render: media saliente (imagen/audio/video/doc), burbujas con context (cita) muestran fragmento citado, reacciones como chip bajo la burbuja. markReadAction se sigue llamando al abrir (ahora pega a Meta).
- [ ] **Step 4:** tsc + lint + test + build verde. Commit `feat(inbox): composer con canned/media/citar/reaccionar + CRUD respuestas rápidas`.

---

### Task 6: Review + deploy + smoke

- [ ] Review subagente (spec compliance + calidad + límites Meta respetados + aislamiento/gate).
- [ ] Gauntlet completo. Push + `deploy/deploy.sh`.
- [ ] Smoke prod: `/configuracion/meta` muestra webhook URL + verify token con copiar; `/configuracion/respuestas` CRUD; `/inbox` sin romper (sin org con creds Meta el envío real no aplica, pero la UI carga). Actualizar memoria.

---

## Self-review

Cobertura spec: A (verify token auto T3, copy-paste T3, probar conexión T3, credenciales reducidas T3); B inbox (respuestas rápidas T2+T5, marcar leído+typing T1+T4, media T1+T4+T5, citar T1+T4+T5, reacciones T1+T4+T5); límites Meta documentados en spec. Tipos consistentes: markRead/uploadMedia/sendMedia/sendReaction (T1) usados en T4; quick-replies store (T2) en T5; ensureVerifyToken (T3). Paralelizable: T1/T2/T3 archivos disjuntos (client.ts / domain.ts+quick-replies.ts / settings.ts+config-meta). T4 toca inbox/actions+store, T5 toca UI — secuenciales tras sus deps.
