# Inbox: control de agente + etiquetas de conversación + auto-reload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar visibilidad y control del agente IA en el inbox (badge/filtro/pausar-retomar/banner de handoff), etiquetas de conversación estilo Chatwoot, y auto-reload tras deploy para eliminar el "Algo salió mal".

**Architecture:** 2 tablas nuevas (`conversation_labels` + `conversation_label_links`) con capa `lib/inbox/labels.ts`; helper de pausa scoped por org; `agentPaused` + filtros en `listConversations`; componentes de inbox (badge, banner, chips, popover) con server actions; detección del error de Server Action en `(app)/error.tsx` con auto-reload anti-bucle.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle (bun:sqlite), Vitest (`bunx vitest run`), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-23-inbox-control-agente-etiquetas-design.md`

**Convenciones:** tests `bunx vitest run <ruta>` (NO `bun test`); typecheck `bunx tsc --noEmit` (si falla con `.next/types/* 2.ts`, `find .next/types -name "* 2.ts" -delete` antes); lint `bun run lint`; build `bun run build` (un client component NO debe importar módulos con SDK). Commits terminan con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Hechos verificados del código:**
- `src/lib/agent/pause.ts` ya tiene `pauseAgent`, `resumeAgent`, `isPaused` (filtran solo por conversationId).
- `src/lib/inbox/store.ts`: `ConversationListItem` (línea 252) NO trae `agentPaused`; `listConversations` (263) hace el SELECT (línea ~302); `getThread` hace `select()` completo (ya incluye agentPaused).
- `src/app/(app)/error.tsx` existe (client component con el texto "Algo salió mal / Ocurrió un error al cargar esta sección"); `src/app/global-error.tsx` existe.
- `domain.ts` ya importa `primaryKey`.
- Auto-pausa: `src/app/(app)/inbox/actions.ts` llama `pauseAgent` cuando un humano envía (NO tocar eso).

---

## Task 1: Tablas de etiquetas de conversación (migración aditiva)

**Files:** Modify `src/lib/db/schema/domain.ts`; migración en `drizzle/`.

- [ ] **Step 1: Añadir tablas al schema**

En `src/lib/db/schema/domain.ts`, al final, añade (usa `conversations` y `organization` ya referenciados en el archivo; `primaryKey` ya está importado):
```ts
export const conversationLabels = sqliteTable("conversation_labels", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const conversationLabelLinks = sqliteTable(
  "conversation_label_links",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => conversationLabels.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.conversationId, t.labelId] }) }),
);
```

- [ ] **Step 2: Generar y verificar migración aditiva**

Run: `cd ~/Documents/wa-blast && bun run db:generate`
Expected: nuevo `drizzle/migrations/00NN_*.sql` con `CREATE TABLE \`conversation_labels\`` y `CREATE TABLE \`conversation_label_links\``, sin DROP/ALTER de otras tablas. Verifica: `ls -t drizzle/migrations/*.sql | head -1 | xargs grep -ci "create table"` → debe dar 2.

- [ ] **Step 3: Aplicar + tsc**

Run: `bun run db:migrate && bunx tsc --noEmit` → limpio.

- [ ] **Step 4: Commit**
```bash
git add src/lib/db/schema/domain.ts drizzle/
git commit -m "feat(db): tablas conversation_labels + links (etiquetas de conversación)"
```

---

## Task 2: Capa `lib/inbox/labels.ts`

**Files:** Create `src/lib/inbox/labels.ts`, `src/lib/inbox/labels.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/inbox/labels.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import {
  createLabel, listLabels, deleteLabel,
  getConversationLabels, setConversationLabels, labelsByConversation,
} from "./labels";

async function seed(db: any, orgId = "o1") {
  await db.insert(organization).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() }).onConflictDoNothing();
  const convId = "c1";
  await db.insert(conversations).values({
    id: convId, orgId, phone: "57300", status: "open", unreadCount: 0,
    lastMessageAt: new Date(), createdAt: new Date(),
  }).onConflictDoNothing();
  return convId;
}

describe("inbox labels", () => {
  it("crea, lista y asigna etiquetas a una conversación", async () => {
    const { db } = makeTestDb();
    const convId = await seed(db);
    const a = await createLabel(db, "o1", { name: "Pagó", color: "#10b981" });
    const b = await createLabel(db, "o1", { name: "Mayorista", color: "#f59e0b" });
    expect((await listLabels(db, "o1")).length).toBe(2);

    await setConversationLabels(db, "o1", convId, [a, b]);
    expect((await getConversationLabels(db, "o1", convId)).map((l) => l.id).sort()).toEqual([a, b].sort());

    await setConversationLabels(db, "o1", convId, [a]); // reemplaza el set
    expect((await getConversationLabels(db, "o1", convId)).map((l) => l.name)).toEqual(["Pagó"]);
  });

  it("dedupe por nombre (case-insensitive) en la org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await createLabel(db, "o1", { name: "VIP", color: "#000" });
    await expect(createLabel(db, "o1", { name: "vip", color: "#111" })).rejects.toThrow();
  });

  it("labelsByConversation devuelve map sin N+1 y scoped por org", async () => {
    const { db } = makeTestDb();
    const convId = await seed(db);
    const a = await createLabel(db, "o1", { name: "X", color: "#000" });
    await setConversationLabels(db, "o1", convId, [a]);
    const map = await labelsByConversation(db, "o1", [convId]);
    expect(map[convId]?.[0]?.name).toBe("X");
  });

  it("deleteLabel quita la etiqueta del catálogo y de las conversaciones", async () => {
    const { db } = makeTestDb();
    const convId = await seed(db);
    const a = await createLabel(db, "o1", { name: "Tmp", color: "#000" });
    await setConversationLabels(db, "o1", convId, [a]);
    await deleteLabel(db, "o1", a);
    expect((await listLabels(db, "o1")).length).toBe(0);
    expect((await getConversationLabels(db, "o1", convId)).length).toBe(0);
  });
});
```
> Ajusta el `seed` a las columnas REALES de `conversations`/`organization` (léelas en `domain.ts`); el ejemplo asume las mínimas. Si `makeTestDb` necesita otra forma, sigue el patrón de un test existente que use `makeTestDb` con inserts (busca uno).

- [ ] **Step 2: Run red**: `bunx vitest run src/lib/inbox/labels.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

Create `src/lib/inbox/labels.ts`:
```ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { conversationLabelLinks, conversationLabels, conversations } from "@/lib/db/schema";

export type Label = { id: string; name: string; color: string };

export async function listLabels(db: DB, orgId: string): Promise<Label[]> {
  return db
    .select({ id: conversationLabels.id, name: conversationLabels.name, color: conversationLabels.color })
    .from(conversationLabels)
    .where(eq(conversationLabels.orgId, orgId))
    .orderBy(conversationLabels.name);
}

export async function createLabel(db: DB, orgId: string, input: { name: string; color: string }): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Nombre de etiqueta requerido");
  const existing = await db
    .select({ id: conversationLabels.id })
    .from(conversationLabels)
    .where(and(eq(conversationLabels.orgId, orgId), eq(sql`lower(${conversationLabels.name})`, name.toLowerCase())));
  if (existing.length) throw new Error("Ya existe una etiqueta con ese nombre");
  const id = randomUUID();
  await db.insert(conversationLabels).values({ id, orgId, name, color: input.color || "#6366f1", createdAt: new Date() });
  return id;
}

export async function deleteLabel(db: DB, orgId: string, labelId: string): Promise<void> {
  // links se borran por ON DELETE cascade
  await db.delete(conversationLabels).where(and(eq(conversationLabels.id, labelId), eq(conversationLabels.orgId, orgId)));
}

async function assertConvInOrg(db: DB, orgId: string, conversationId: string): Promise<boolean> {
  const r = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
  return r.length > 0;
}

export async function getConversationLabels(db: DB, orgId: string, conversationId: string): Promise<Label[]> {
  return db
    .select({ id: conversationLabels.id, name: conversationLabels.name, color: conversationLabels.color })
    .from(conversationLabelLinks)
    .innerJoin(conversationLabels, eq(conversationLabelLinks.labelId, conversationLabels.id))
    .where(and(eq(conversationLabelLinks.conversationId, conversationId), eq(conversationLabels.orgId, orgId)))
    .orderBy(conversationLabels.name);
}

export async function setConversationLabels(db: DB, orgId: string, conversationId: string, labelIds: string[]): Promise<void> {
  if (!(await assertConvInOrg(db, orgId, conversationId))) throw new Error("Conversación no encontrada");
  // valida que las labels son de la org
  const valid = labelIds.length
    ? (await db.select({ id: conversationLabels.id }).from(conversationLabels)
        .where(and(eq(conversationLabels.orgId, orgId), inArray(conversationLabels.id, labelIds)))).map((r) => r.id)
    : [];
  await db.delete(conversationLabelLinks).where(eq(conversationLabelLinks.conversationId, conversationId));
  if (valid.length) {
    await db.insert(conversationLabelLinks).values(valid.map((labelId) => ({ conversationId, labelId })));
  }
}

export async function labelsByConversation(db: DB, orgId: string, conversationIds: string[]): Promise<Record<string, Label[]>> {
  const out: Record<string, Label[]> = {};
  if (!conversationIds.length) return out;
  const rows = await db
    .select({
      conversationId: conversationLabelLinks.conversationId,
      id: conversationLabels.id, name: conversationLabels.name, color: conversationLabels.color,
    })
    .from(conversationLabelLinks)
    .innerJoin(conversationLabels, eq(conversationLabelLinks.labelId, conversationLabels.id))
    .where(and(eq(conversationLabels.orgId, orgId), inArray(conversationLabelLinks.conversationId, conversationIds)));
  for (const r of rows) {
    (out[r.conversationId] ??= []).push({ id: r.id, name: r.name, color: r.color });
  }
  return out;
}
```

- [ ] **Step 4: Run green**: `bunx vitest run src/lib/inbox/labels.test.ts` → PASS (4 tests).
- [ ] **Step 5: Commit**: `git add src/lib/inbox/labels.ts src/lib/inbox/labels.test.ts && git commit -m "feat(inbox): capa de etiquetas de conversación"`

---

## Task 3: Pausa scoped por org

**Files:** Modify `src/lib/agent/pause.ts`; Test `src/lib/agent/pause.test.ts` (créalo o extiéndelo).

- [ ] **Step 1: Write the failing test**

En `src/lib/agent/pause.test.ts` (si no existe, créalo; usa makeTestDb + seed de org/conversación como en Task 2):
```ts
it("setAgentPaused respeta orgId y togglea", async () => {
  const { db } = makeTestDb();
  // seed org o1 + conversación c1 (orgId=o1)
  await setAgentPaused(db, "o1", "c1", true);
  expect(await isPaused(db, "c1")).toBe(true);
  await setAgentPaused(db, "o1", "c1", false);
  expect(await isPaused(db, "c1")).toBe(false);
  // org equivocada NO cambia
  await setAgentPaused(db, "o1", "c1", true);
  await setAgentPaused(db, "OTRA", "c1", false);
  expect(await isPaused(db, "c1")).toBe(true);
});
```

- [ ] **Step 2: Run red** → FAIL (`setAgentPaused` no existe).

- [ ] **Step 3: Implementación** — añade a `src/lib/agent/pause.ts`:
```ts
import { and } from "drizzle-orm";
// ...
export async function setAgentPaused(db: DB, orgId: string, conversationId: string, paused: boolean): Promise<void> {
  await db.update(conversations).set({ agentPaused: paused })
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
}
```
(Importa `and` junto a `eq`.)

- [ ] **Step 4: Run green** → PASS.
- [ ] **Step 5: Commit**: `git add src/lib/agent/pause.ts src/lib/agent/pause.test.ts && git commit -m "feat(agent): setAgentPaused scoped por org"`

---

## Task 4: `agentPaused` + filtros en `listConversations`

**Files:** Modify `src/lib/inbox/store.ts`; Test `src/lib/inbox/store.test.ts` (extiende o crea).

- [ ] **Step 1: Write the failing test** (sigue el patrón de tests de store existentes; si no hay, usa makeTestDb + seed). Cubre:
```ts
it("listConversations trae agentPaused y filtra por agent ia/humano", async () => {
  const { db } = makeTestDb();
  // seed org + 2 conversaciones: c_ia (agentPaused=false), c_hum (agentPaused=true)
  const all = await listConversations(db, "o1", {});
  expect(all.find((c) => c.id === "c_ia")).toHaveProperty("agentPaused", false);

  const ia = await listConversations(db, "o1", { agent: "ia" });
  expect(ia.map((c) => c.id)).toContain("c_ia");
  expect(ia.map((c) => c.id)).not.toContain("c_hum");

  const hum = await listConversations(db, "o1", { agent: "humano" });
  expect(hum.map((c) => c.id)).toContain("c_hum");
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implementación** en `src/lib/inbox/store.ts`:
1. Añade `agentPaused: boolean;` a `ConversationListItem` (tras `status`).
2. Amplía la firma de opts: `opts: { q?: string; unreadOnly?: boolean; status?: "open" | "resolved" | "all"; agent?: "ia" | "humano" | "all"; labelId?: string }`.
3. Tras el bloque de `unreadOnly`, añade el filtro de agente:
```ts
  if (opts.agent === "ia") conditions.push(eq(conversations.agentPaused, false));
  if (opts.agent === "humano") conditions.push(eq(conversations.agentPaused, true));
```
4. Filtro por etiqueta (subconsulta EXISTS para no romper el shape):
```ts
  if (opts.labelId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${conversationLabelLinks} WHERE ${conversationLabelLinks.conversationId} = ${conversations.id} AND ${conversationLabelLinks.labelId} = ${opts.labelId})`,
    );
  }
```
(Importa `conversationLabelLinks` de `@/lib/db/schema`.)
5. En el `.select({...})` añade `agentPaused: conversations.agentPaused,`.

- [ ] **Step 4: Run green** + `bunx tsc --noEmit`.
- [ ] **Step 5: Commit**: `git add src/lib/inbox/store.ts src/lib/inbox/store.test.ts && git commit -m "feat(inbox): agentPaused + filtros agent/label en listConversations"`

---

## Task 5: UI — Badge de agente, filtro, banner y pausar/retomar

**Files:** Create `src/app/(app)/inbox/_components/agent-badge.tsx`; Modify `src/app/(app)/inbox/page.tsx` (lista + filtro), `src/app/(app)/inbox/[id]/page.tsx` (header), `src/app/(app)/inbox/actions.ts` (action). READ esos archivos antes de editar para seguir su patrón.

- [ ] **Step 1: Server action** en `src/app/(app)/inbox/actions.ts` (sigue el estilo de las actions existentes: `requireOrg`, `revalidatePath`):
```ts
import { setAgentPaused } from "@/lib/agent/pause";
// ...
export async function setAgentPausedAction(conversationId: string, paused: boolean): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try { await setAgentPaused(db, orgId, conversationId, paused); }
  catch (e) { return { error: e instanceof Error ? e.message : "Error" }; }
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}
```

- [ ] **Step 2: `AgentBadge`** (`src/app/(app)/inbox/_components/agent-badge.tsx`, client o server, sin SDK):
```tsx
export function AgentBadge({ agentEnabled, agentPaused }: { agentEnabled: boolean; agentPaused: boolean }) {
  if (!agentEnabled) return null;
  return agentPaused ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">🧑 Humano</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">🤖 IA</span>
  );
}
```

- [ ] **Step 3: Lista** (`inbox/page.tsx`): el server component ya carga `listConversations`. Lee `getAgentConfig(db, orgId).enabled` UNA vez y pásalo. Lee `?agent=` de searchParams y pásalo a `listConversations({ agent })`. Renderiza `<AgentBadge agentEnabled={...} agentPaused={c.agentPaused} />` en cada card. Añade un control de filtro (3 links/segmented: Todas / 🤖 IA / 🧑 Humano) que setean `?agent=`. Sigue cómo el archivo ya maneja el filtro de estado/búsqueda por query params.

- [ ] **Step 4: Detalle** (`inbox/[id]/page.tsx`): `getThread` ya trae `agentPaused`. Carga `agentConfig.enabled`. En el header renderiza el badge. Debajo, si `agentEnabled`:
  - si `agentPaused`: banner "La IA está en pausa en este chat" + botón **Retomar IA** (client component que llama `setAgentPausedAction(convId, false)`).
  - si no: botón **Pausar IA** → `setAgentPausedAction(convId, true)`.
  Crea un pequeño client component `agent-controls.tsx` para los botones (usa `useTransition` + `toast` + `router.refresh()`, patrón de otros forms del inbox).

- [ ] **Step 5: Verificar** `bunx tsc --noEmit && bun run build` (build OK = sin SDK en cliente). Commit: `feat(inbox-ui): badge IA/Humano, filtro y pausar/retomar agente`.

---

## Task 6: UI — Etiquetas de conversación (chips, popover, filtro)

**Files:** Create `src/app/(app)/inbox/_components/label-chips.tsx`, `src/app/(app)/inbox/[id]/_components/label-popover.tsx`; Modify `inbox/actions.ts`, `inbox/page.tsx`, `inbox/[id]/page.tsx`.

- [ ] **Step 1: Server actions** en `inbox/actions.ts`:
```ts
import { createLabel, deleteLabel, setConversationLabels } from "@/lib/inbox/labels";
export async function createLabelAction(input: { name: string; color: string }): Promise<{ ok: true; id: string } | { error: string }> {
  const { orgId } = await requireOrg();
  try { const id = await createLabel(db, orgId, input); revalidatePath("/inbox"); return { ok: true, id }; }
  catch (e) { return { error: e instanceof Error ? e.message : "Error" }; }
}
export async function deleteLabelAction(id: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try { await deleteLabel(db, orgId, id); revalidatePath("/inbox"); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "Error" }; }
}
export async function setConversationLabelsAction(conversationId: string, labelIds: string[]): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try { await setConversationLabels(db, orgId, conversationId, labelIds); revalidatePath("/inbox"); revalidatePath(`/inbox/${conversationId}`); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "Error" }; }
}
```

- [ ] **Step 2: `LabelChips`** (presentacional): recibe `labels: {id,name,color}[]` y pinta chips con el color (texto legible). Úsalo en la lista (bajo el preview) y en el header del detalle.

- [ ] **Step 3: Lista** (`inbox/page.tsx`): tras `listConversations`, llama `labelsByConversation(db, orgId, items.map(i=>i.id))` y pásale a cada card sus labels → `<LabelChips>`. Añade filtro por etiqueta: lee `?label=` y pásalo a `listConversations({ labelId })`; renderiza un dropdown con `listLabels` para elegir.

- [ ] **Step 4: `LabelPopover`** (client, en el detalle): muestra `listLabels` con checkboxes (estado inicial = labels de la conversación), permite crear una nueva (nombre + color simple) vía `createLabelAction`, y guarda con `setConversationLabelsAction(convId, selectedIds)`. El detalle carga `getConversationLabels` + `listLabels` y los pasa.

- [ ] **Step 5: Verificar** `bunx tsc --noEmit && bun run build`. Commit: `feat(inbox-ui): etiquetas de conversación (chips, popover, filtro)`.

---

## Task 7: Auto-reload tras deploy (Server Action obsoleta)

**Files:** Modify `src/app/(app)/error.tsx` (y `src/app/global-error.tsx` si aplica el mismo patrón).

- [ ] **Step 1: Implementación** en `src/app/(app)/error.tsx` — en el `useEffect`, detecta el error de Server Action y auto-recarga una vez con guard anti-bucle:
```tsx
  useEffect(() => {
    const msg = `${error?.message ?? ""} ${error?.digest ?? ""}`;
    const isStaleAction = /Failed to find Server Action|older or newer deployment/i.test(msg);
    if (isStaleAction && typeof window !== "undefined") {
      if (!sessionStorage.getItem("sa-reloaded")) {
        sessionStorage.setItem("sa-reloaded", "1");
        window.location.reload();
        return;
      }
    }
    console.error("[app-error] error:", error);
  }, [error]);
```
Y añade, en un componente cliente que monte en navegación normal (o en el propio layout del inbox), la limpieza de la marca para permitir futuros auto-reloads. Como mínimo, en `error.tsx` no limpiamos; añade en `src/app/(app)/layout.tsx` (que ya es server) NO aplica — en su lugar, limpia la marca dentro del MISMO `error.tsx` solo cuando NO es stale (no aplica porque solo corre en error). **Solución simple y robusta:** limpiar la marca con un `useEffect` en un client component montado en cada página del inbox — pero para no dispersar, hazlo así: en `error.tsx`, cuando `isStaleAction` y la marca YA existe (segundo fallo), NO recargues y `sessionStorage.removeItem("sa-reloaded")` (resetea para el próximo deploy) y muestra la UI de error normal. Eso evita bucle (máx 1 reload por incidente) y se auto-resetea.

Reemplaza el bloque por:
```tsx
  useEffect(() => {
    const msg = `${error?.message ?? ""} ${error?.digest ?? ""}`;
    const isStaleAction = /Failed to find Server Action|older or newer deployment/i.test(msg);
    if (isStaleAction && typeof window !== "undefined") {
      if (sessionStorage.getItem("sa-reloaded")) {
        sessionStorage.removeItem("sa-reloaded"); // segundo fallo: no insistir, resetea
      } else {
        sessionStorage.setItem("sa-reloaded", "1");
        window.location.reload();
        return;
      }
    }
    console.error("[app-error] error:", error);
  }, [error]);
```
Aplica el mismo `useEffect` a `src/app/global-error.tsx` (tiene su propio `Error` boundary) si su estructura lo permite.

- [ ] **Step 2: Verificar** `bunx tsc --noEmit && bun run build`. (No hay test unitario simple del boundary; se valida en vivo en Task 8. Si quieres test, extrae la condición a una función pura `isStaleActionError(msg)` y testea esa.)

- [ ] **Step 3 (recomendado): test de la función pura** — extrae a `src/app/(app)/_stale-action.ts`:
```ts
export function isStaleActionError(msg: string): boolean {
  return /Failed to find Server Action|older or newer deployment/i.test(msg);
}
```
úsala en ambos boundaries; test `_stale-action.test.ts` con casos positivo/negativo.

- [ ] **Step 4: Commit**: `feat(ux): auto-reload tras deploy ante Server Action obsoleta (anti-bucle)`

---

## Task 8: Verificación final + en vivo

- [ ] **Step 1:** `find .next/types -name "* 2.ts" -delete; bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build` → todo verde/pasa.
- [ ] **Step 2:** Merge a `main`, deploy (`bash deploy/deploy.sh`, migración aditiva, health 200).
- [ ] **Step 3 (en vivo, org "luis" 49644ae3):** en el inbox: ver badge 🤖 IA en una conversación; **Pausar IA** → badge 🧑 Humano + banner; **Retomar IA**; crear etiqueta "Pagó", asignarla a un chat, verla como chip y **filtrar** por ella + por IA/Humano; tras el deploy, abrir una pestaña vieja y confirmar que **auto-recarga** en vez de "Algo salió mal".

---

## Self-Review (cobertura del spec)

- **A control agente:** Task 3 (setAgentPaused) + Task 4 (agentPaused+filtro en lista) + Task 5 (badge/filtro/banner/botones/action). ✓
- **B etiquetas conversación:** Task 1 (tablas) + Task 2 (capa) + Task 4 (filtro label) + Task 6 (chips/popover/filtro/actions). ✓
- **C auto-reload:** Task 7 (error.tsx + global-error.tsx + función pura testeable). ✓
- **Tests:** labels (Task 2), pausa (Task 3), store filtros (Task 4), función stale (Task 7); UI validada en vivo (Task 8). ✓
- **Migración aditiva:** Task 1. ✓
- **Tipos consistentes:** `Label {id,name,color}` (Task 2) usado en store/UI; `setConversationLabels(orgId,convId,ids)`, `setAgentPaused(orgId,convId,bool)`, `listConversations(opts.agent|labelId)` coherentes entre Task 3/4/5/6. ✓
- **GOTCHA bundle:** Tasks 5/6/7 componentes cliente sin SDK; `bun run build` obligatorio en cada una. ✓
