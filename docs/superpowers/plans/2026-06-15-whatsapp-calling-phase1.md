# WhatsApp Calling Fase 1 (eventos + configuración) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar eventos de llamada de WhatsApp vía webhook y mostrarlos inline en la conversación + en una vista de registro `/llamadas`, más una página para habilitar/configurar el calling del número. Sin audio (WebRTC = Fases 2/3).

**Architecture:** Tabla `calls` (upsert por `wacid`), webhook parsea `value.calls[]` → `handleCallEvent` enlaza a la conversación; el hilo interleava llamadas como notas; vista `/llamadas`; config vía cliente Meta aislado `calling.ts`. Apegado a la doc de Meta (Calling API).

**Tech Stack:** Next 16 App Router (Node), Drizzle + better-sqlite3, Vitest (`makeTestDb`), WhatsApp Cloud API, lucide-react, sonner.

**Spec:** `docs/superpowers/specs/2026-06-15-whatsapp-calling-phase1-design.md`

**Convenciones:** `bun run test`, `bunx tsc --noEmit | grep -v '\.next'`, `bun run lint`, migraciones `bun run db:generate`, commits español, deploy `deploy/deploy.sh`. Datos Meta de la doc: webhook `value.calls[]` = `{id, from, to, event ("connect"|"terminate"), timestamp, direction ("USER_INITIATED"|"BUSINESS_INITIATED"), session?{sdp,sdp_type}}`; settings `POST/GET /v{ver}/{phoneId}/settings` body `{calling:{status,...}}`.

---

## File Structure
- Create `src/lib/calls/store.ts` — recordCallEvent, listCalls, getCallsForConversation.
- Create `src/lib/meta/calling.ts` — getCallingSettings, setCallingSettings (aislado).
- Create `src/app/(app)/llamadas/page.tsx` — vista de registro.
- Create `src/app/(app)/configuracion/llamadas/page.tsx` + `actions.ts` — config UI.
- Create `src/app/(app)/inbox/[id]/_components/call-entry.tsx` — render inline de una llamada.
- Modify `src/lib/db/schema/domain.ts` — tabla `calls`.
- Modify `src/lib/meta/webhook.ts` — schema `calls`.
- Modify `src/lib/meta/webhook-handlers.ts` — `handleCallEvent`.
- Modify `src/app/api/webhook/meta/route.ts` — invocar handleCallEvent.
- Modify `src/lib/inbox/store.ts` — `getThread` devuelve `calls`.
- Modify `src/app/(app)/inbox/[id]/_components/{thread-and-composer,thread}.tsx` — interleave calls.
- Modify `src/app/(app)/inbox/[id]/page.tsx` — pasar calls.
- Modify `src/app/(app)/layout.tsx` — entrada `/llamadas` + `/configuracion/llamadas` en el sidebar.

---

### Task 1: Tabla `calls` + migración

**Files:** Modify `src/lib/db/schema/domain.ts`

- [ ] **Step 1:** Añadir al final de `domain.ts`:
```typescript
export const calls = sqliteTable(
  "calls",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    status: text("status", { enum: ["ringing", "missed", "completed", "rejected", "failed"] }).notNull(),
    wacid: text("wacid").notNull(),
    durationSec: integer("duration_sec"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    orgIdx: index("calls_org_created").on(t.orgId, t.createdAt),
    convIdx: index("calls_conv").on(t.conversationId),
    wacidUnique: uniqueIndex("calls_org_wacid").on(t.orgId, t.wacid),
  }),
);
```
- [ ] **Step 2:** `bun run db:generate` → nueva migración.
- [ ] **Step 3:** `bun run test tests/unit/quick-replies.test.ts` (sigue verde → makeTestDb aplica la migración).
- [ ] **Step 4:** Commit `feat(db): tabla calls`.

---

### Task 2: Store de llamadas (TDD)

**Files:** Create `src/lib/calls/store.ts` · Test `tests/unit/calls-store.test.ts`

- [ ] **Step 1: Test** `tests/unit/calls-store.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { calls, conversations, organization } from "@/lib/db/schema";
import { getCallsForConversation, listCalls, recordCallEvent } from "@/lib/calls/store";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
}

describe("calls store", () => {
  it("connect crea ringing, terminate lo completa con duración", async () => {
    const { db } = makeTestDb(); await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.A", direction: "in", event: "connect", ts: new Date(1000) });
    let rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.A"));
    expect(rows[0].status).toBe("ringing");
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.A", direction: "in", event: "terminate", durationSec: 134, ts: new Date(2000) });
    rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.A"));
    expect(rows.length).toBe(1); // upsert, no duplica
    expect(rows[0].status).toBe("completed");
    expect(rows[0].durationSec).toBe(134);
  });

  it("terminate sin duración → missed", async () => {
    const { db } = makeTestDb(); await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.B", direction: "in", event: "terminate", durationSec: 0, ts: new Date() });
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.B"));
    expect(rows[0].status).toBe("missed");
  });

  it("listCalls filtra por estado y aísla por org", async () => {
    const { db } = makeTestDb(); await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "w1", direction: "in", event: "terminate", durationSec: 10, ts: new Date() });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "w2", direction: "in", event: "terminate", durationSec: 0, ts: new Date() });
    expect((await listCalls(db, "o1", {})).length).toBe(2);
    expect((await listCalls(db, "o1", { status: "missed" })).length).toBe(1);
    expect((await listCalls(db, "o2", {})).length).toBe(0);
    expect((await getCallsForConversation(db, "o1", "c1")).length).toBe(2);
  });
});
```
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implementar `src/lib/calls/store.ts`:
```typescript
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { calls, contacts, conversations } from "@/lib/db/schema";

type CallEvent = {
  orgId: string; conversationId: string; phone: string; wacid: string;
  direction: "in" | "out"; event: "connect" | "terminate";
  status?: string; durationSec?: number; ts: Date;
};

function statusFor(e: CallEvent): "ringing" | "missed" | "completed" | "rejected" | "failed" {
  if (e.event === "connect") return "ringing";
  // terminate: Meta puede mandar un status; si no, deducir por duración
  const s = (e.status ?? "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("fail")) return "failed";
  if ((e.durationSec ?? 0) > 0) return "completed";
  return "missed";
}

export async function recordCallEvent(db: DB, e: CallEvent): Promise<void> {
  const status = statusFor(e);
  const existing = (await db.select().from(calls).where(and(eq(calls.orgId, e.orgId), eq(calls.wacid, e.wacid))))[0];
  if (existing) {
    await db.update(calls).set({
      status,
      durationSec: e.durationSec ?? existing.durationSec ?? null,
      endedAt: e.event === "terminate" ? e.ts : existing.endedAt,
    }).where(eq(calls.id, existing.id));
    return;
  }
  await db.insert(calls).values({
    id: randomUUID(), orgId: e.orgId, conversationId: e.conversationId, phone: e.phone,
    direction: e.direction, status, wacid: e.wacid,
    durationSec: e.durationSec ?? null,
    startedAt: e.event === "connect" ? e.ts : null,
    endedAt: e.event === "terminate" ? e.ts : null,
    createdAt: e.ts,
  });
}

export type CallListItem = {
  id: string; phone: string; contactName: string | null; direction: "in" | "out";
  status: string; durationSec: number | null; createdAt: Date; conversationId: string;
};

export async function listCalls(db: DB, orgId: string, opts: { status?: string; direction?: string; q?: string }): Promise<CallListItem[]> {
  const conds: SQL<unknown>[] = [eq(calls.orgId, orgId)];
  if (opts.status) conds.push(eq(calls.status, opts.status as never));
  if (opts.direction) conds.push(eq(calls.direction, opts.direction as never));
  if (opts.q) {
    const qq = `%${opts.q.toLowerCase()}%`;
    const o = or(like(sql`lower(${contacts.name})`, qq), like(calls.phone, `%${opts.q}%`));
    if (o) conds.push(o);
  }
  return db.select({
    id: calls.id, phone: calls.phone, contactName: contacts.name, direction: calls.direction,
    status: calls.status, durationSec: calls.durationSec, createdAt: calls.createdAt, conversationId: calls.conversationId,
  }).from(calls)
    .leftJoin(conversations, eq(calls.conversationId, conversations.id))
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(and(...conds)).orderBy(desc(calls.createdAt));
}

export async function getCallsForConversation(db: DB, orgId: string, conversationId: string) {
  return db.select().from(calls)
    .where(and(eq(calls.orgId, orgId), eq(calls.conversationId, conversationId)))
    .orderBy(calls.createdAt);
}
```
- [ ] **Step 4:** Run → pass. `bunx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(calls): store de llamadas (recordCallEvent/listCalls)`.

---

### Task 3: Webhook — parsear `calls` + handleCallEvent (TDD)

**Files:** Modify `src/lib/meta/webhook.ts`, `src/lib/meta/webhook-handlers.ts`, `src/app/api/webhook/meta/route.ts` · Test `tests/unit/webhook-call.test.ts`

- [ ] **Step 1:** En `webhook.ts`, añadir al `value` del schema (junto a `messages`/`statuses`):
```typescript
            calls: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string().optional(),
                  to: z.string().optional(),
                  event: z.string(),
                  timestamp: z.string().optional(),
                  direction: z.string().optional(),
                  status: z.string().optional(),
                  duration: z.number().optional(),
                }).passthrough(),
              )
              .optional(),
```
- [ ] **Step 2: Test** `tests/unit/webhook-call.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { calls, organization } from "@/lib/db/schema";
import { handleCallEvent } from "@/lib/meta/webhook-handlers";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("handleCallEvent", () => {
  it("crea conversación + registro de llamada entrante", async () => {
    const { db } = makeTestDb(); await seed(db);
    await handleCallEvent(db, "o1", { id: "wacid.X", from: "57300", event: "connect", timestamp: "1700000000", direction: "USER_INITIATED" } as any);
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.X"));
    expect(rows.length).toBe(1);
    expect(rows[0].direction).toBe("in");
    expect(rows[0].status).toBe("ringing");
    expect(rows[0].phone).toBe("+57300");
  });
});
```
- [ ] **Step 3:** Run → fail. En `webhook-handlers.ts` añadir (importar `getOrCreateConversation` ya está; importar `recordCallEvent` de `@/lib/calls/store`):
```typescript
export async function handleCallEvent(
  db: DB,
  orgId: string,
  call: { id: string; from?: string; to?: string; event: string; timestamp?: string; direction?: string; status?: string; duration?: number },
) {
  const phoneRaw = call.direction === "BUSINESS_INITIATED" ? call.to : call.from;
  if (!phoneRaw) return;
  const phone = "+" + phoneRaw.replace(/^\+/, "");
  const ts = call.timestamp ? new Date(Number(call.timestamp) * 1000) : new Date();
  const direction: "in" | "out" = call.direction === "BUSINESS_INITIATED" ? "out" : "in";
  const conv = await getOrCreateConversation(db, orgId, phone, ts);
  const event: "connect" | "terminate" = call.event === "terminate" ? "terminate" : "connect";
  await recordCallEvent(db, {
    orgId, conversationId: conv.id, phone, wacid: call.id, direction, event,
    status: call.status, durationSec: call.duration, ts,
  });
}
```
- [ ] **Step 4:** En `route.ts`, dentro del loop de `change.value`, añadir tras el bloque de `v.messages`:
```typescript
      if (v.calls) {
        for (const c of v.calls) await handleCallEvent(db, settings.orgId, c);
      }
```
- [ ] **Step 5:** Run → pass. `bunx tsc --noEmit`. Commit `feat(webhook): eventos de llamada (calls) → registro`.

---

### Task 4: Cliente de Call Settings (aislado)

**Files:** Create `src/lib/meta/calling.ts`

- [ ] **Step 1:** Implementar (apegado a doc Meta; aislar nombres exactos aquí):
```typescript
import type { DecryptedSettings } from "@/lib/org/settings";

const GRAPH = "https://graph.facebook.com/v22.0";

export type CallingSettings = {
  status: "ENABLED" | "DISABLED";
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL";
  callback_permission_status?: "ENABLED" | "DISABLED";
};

export async function getCallingSettings(s: DecryptedSettings): Promise<CallingSettings | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) return { error: "Meta no configurado" };
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/settings`, {
    headers: { authorization: `Bearer ${s.metaAccessToken}` },
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "No se pudo leer la configuración" };
  }
  const j = (await res.json()) as { calling?: CallingSettings };
  return j.calling ?? { status: "DISABLED" };
}

export async function setCallingSettings(s: DecryptedSettings, patch: Partial<CallingSettings>): Promise<{ ok: true } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) return { error: "Meta no configurado" };
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/settings`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ calling: patch }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "No se pudo guardar" };
  }
  return { ok: true };
}
```
- [ ] **Step 2:** `bunx tsc --noEmit`. Commit `feat(meta): cliente de Call Settings (calling.ts)`.

---

### Task 5: getThread devuelve calls + render inline

**Files:** Modify `src/lib/inbox/store.ts`, `inbox/[id]/page.tsx`, `inbox/[id]/_components/thread-and-composer.tsx`, `thread.tsx` · Create `inbox/[id]/_components/call-entry.tsx`

- [ ] **Step 1:** En `store.ts` `getThread`: importar `getCallsForConversation` de `@/lib/calls/store`; antes del return, `const callRows = await getCallsForConversation(db, orgId, conversationId);` y añadir `calls: callRows` al objeto devuelto.
- [ ] **Step 2:** `page.tsx` ([id]): pasar `calls={thread.calls}` a `<ThreadAndComposer>`.
- [ ] **Step 3:** `thread-and-composer.tsx`: añadir prop `calls` (tipo `{ id: string; direction: "in"|"out"; status: string; durationSec: number|null; createdAt: Date }[]`), pasarlo a `<Thread calls={calls}>`; incluir `calls.length` en el dep del auto-scroll.
- [ ] **Step 4:** Create `call-entry.tsx` ("use client" no requerido):
```tsx
import { PhoneIncomingIcon, PhoneMissedIcon, PhoneOutgoingIcon } from "lucide-react";

export function CallEntry({ call }: { call: { direction: "in" | "out"; status: string; durationSec: number | null; createdAt: Date } }) {
  const missed = call.status === "missed" || call.status === "rejected" || call.status === "failed";
  const Icon = missed ? PhoneMissedIcon : call.direction === "out" ? PhoneOutgoingIcon : PhoneIncomingIcon;
  const dur = call.durationSec ? `${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, "0")}` : null;
  const label = missed
    ? call.direction === "out" ? "Llamada no contestada" : "Llamada perdida"
    : call.direction === "out" ? `Llamada saliente${dur ? ` · ${dur}` : ""}` : `Llamada contestada${dur ? ` · ${dur}` : ""}`;
  const time = call.createdAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="my-2 flex justify-center">
      <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${missed ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>
        <Icon className="size-3.5" /> <span>{label}</span> <span className="opacity-60">{time}</span>
      </div>
    </div>
  );
}
```
- [ ] **Step 5:** `thread.tsx`: extender el `TimelineItem` union con `{ kind: "call"; at: Date; call: ... }`, mergear `calls` en el timeline (junto a messages+notes, ordenado por `at`), y renderizar `<CallEntry call={item.call} />`. Import `CallEntry`.
- [ ] **Step 6:** `bunx tsc --noEmit` + `bun run lint`. Commit `feat(inbox): llamadas inline en el hilo`.

---

### Task 6: Vista de registro `/llamadas`

**Files:** Create `src/app/(app)/llamadas/page.tsx` · Modify `src/app/(app)/layout.tsx`

- [ ] **Step 1:** `llamadas/page.tsx` (server, `export const dynamic = "force-dynamic"`): `requireOrg`, leer searchParams `{status, direction, q}`, `listCalls(db, orgId, {...})`, render una tabla/lista: por fila `<ContactAvatar seed={phone} name={contactName} size={36} />` + nombre/teléfono + ícono+estado + duración + `<LocalDateTime iso={createdAt.toISOString()} />`, fila enlaza a `/inbox/{conversationId}`. Filtros como Links con searchParams (patrón del filtro Abiertas/Resueltas del inbox). Encabezado y estado vacío ("Sin llamadas todavía"). Reusar `ContactAvatar` y `LocalDateTime`.
- [ ] **Step 2:** `layout.tsx`: añadir `{ href: "/llamadas", icon: PhoneIcon, label: "Llamadas" }` a los `STANDALONE_ITEMS` (junto a Inbox) — import `PhoneIcon` de lucide.
- [ ] **Step 3:** `bunx tsc --noEmit` + `bun run lint`. Commit `feat(llamadas): vista de registro de llamadas`.

---

### Task 7: Configuración `/configuracion/llamadas`

**Files:** Create `src/app/(app)/configuracion/llamadas/page.tsx` + `actions.ts` · Modify `layout.tsx` (opcional: link en grupo Cuenta)

- [ ] **Step 1:** `configuracion/llamadas/actions.ts` ("use server"): `toggleCallingAction(formData)` y/o `saveCallingSettingsAction(formData)` que devuelven `{ ok, message }`:
```typescript
"use server";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getOrgSettings } from "@/lib/org/settings";
import { setCallingSettings } from "@/lib/meta/calling";
import { revalidatePath } from "next/cache";

export async function saveCallingSettingsAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const status = formData.get("status") === "on" ? "ENABLED" : "DISABLED";
  const r = await setCallingSettings(settings, {
    status,
    call_icon_visibility: (formData.get("call_icon_visibility") as "DEFAULT" | "DISABLE_ALL") || "DEFAULT",
    callback_permission_status: formData.get("callback_permission") === "on" ? "ENABLED" : "DISABLED",
  });
  if ("error" in r) return { ok: false, message: r.error };
  revalidatePath("/configuracion/llamadas");
  return { ok: true, message: status === "ENABLED" ? "Llamadas habilitadas" : "Llamadas deshabilitadas" };
}
```
- [ ] **Step 2:** `configuracion/llamadas/page.tsx` (server): `requireOrg`, `getOrgSettings`, `getCallingSettings(settings)` para precargar; render con `<ToastForm action={saveCallingSettingsAction}>` un toggle "Habilitar llamadas" (checkbox name="status"), un select de `call_icon_visibility` (DEFAULT/DISABLE_ALL), un checkbox "Permitir callback" + nota de que requiere suscribir el campo `calls` en el webhook (link a /configuracion/meta) + botón Guardar. Si `getCallingSettings` devuelve error (sin creds), mostrar aviso "Configura Meta primero".
- [ ] **Step 3:** `layout.tsx`: opcional añadir `{ href: "/configuracion/llamadas", icon: PhoneIcon, label: "Llamadas" }` al grupo "Cuenta", o dejar el acceso desde /configuracion. (Mínimo: la ruta existe.)
- [ ] **Step 4:** `bunx tsc --noEmit` + `bun run lint`. Commit `feat(configuración): habilitar/configurar llamadas (Call Settings)`.

---

### Task 8: Suscribir `calls` en instrucciones + review/deploy

- [ ] **Step 1:** En `src/app/(app)/configuracion/meta/page.tsx` (paso 3 del webhook), añadir `calls` a la lista de campos a suscribir.
- [ ] **Step 2:** Gauntlet: `bun run test` (verde) + `bunx tsc --noEmit | grep -v '\.next'` (cero) + `bun run lint` (cero) + `bun run build`. Borrar `* 2.*` si aparecen.
- [ ] **Step 3:** Review subagente (aislamiento por org en store/handler, webhook best-effort, a11y de /llamadas y config). Aplicar findings.
- [ ] **Step 4:** Push `main` + `bash deploy/deploy.sh` + smoke (`/llamadas` 307→login; `/configuracion/llamadas` carga). Actualizar memoria.

---

## Self-review (cobertura del spec)
- Tabla `calls` → Task 1 ✓. Store → Task 2 ✓. Webhook parse+handle+suscribir → Task 3/8 ✓. Cliente Call Settings → Task 4 ✓. getThread+inline → Task 5 ✓. Vista `/llamadas` → Task 6 ✓. Config `/configuracion/llamadas` → Task 7 ✓.
- Tipos consistentes: `recordCallEvent(CallEvent)` (T2) usado por `handleCallEvent` (T3); `getCallsForConversation` (T2) en `getThread` (T5); `CallingSettings` (T4) en config (T7).
- **A verificar en ejecución (aislado, no bloqueante):** nombres exactos de `status`/`duration` en el `terminate` de Meta (ajustar en `recordCallEvent`/handler), versión de Graph que habilita calling (bump en `calling.ts` si v22 no soporta), forma exacta del body de Call Settings (ajustar en `calling.ts`).
