# WhatsApp Calling — Pulido Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulir la Fase 1 de WhatsApp Calling en wa-blast: capturar el SDP del webhook, notificar llamadas entrantes en vivo, endurecer el mapeo de estados con tests, y mejorar la UI de `/llamadas`.

**Architecture:** SQLite + Drizzle (migración 0010 añade `sdp`/`sdp_type` a `calls`). El webhook ya parsea `value.calls[]`; se extiende para extraer `session`. La notificación en vivo sigue el patrón de polling existente (`Poller` de 5s + `router.refresh()`), no SSE. Toasts vía `sonner` (ya montado en el layout). Sonido vía Web Audio API (sin asset binario).

**Tech Stack:** Next.js 15 (App Router, RSC + server actions), Drizzle ORM, drizzle-kit, Vitest, sonner, Bun.

---

## File Structure

- `src/lib/db/schema/domain.ts` — añade columnas `sdp`/`sdpType` a `calls` (modify).
- `drizzle/migrations/0010_*.sql` — migración generada por drizzle-kit (create).
- `src/lib/meta/webhook.ts` — extiende el schema zod de `calls[]` con `session` (modify).
- `src/lib/meta/webhook-handlers.ts` — `handleCallEvent` pasa el SDP (modify).
- `src/lib/calls/store.ts` — `CallEvent` gana `sdp`/`sdpType`; `recordCallEvent` los persiste; `statusFor` refinado; nueva `getRingingCalls` (modify).
- `src/app/(app)/llamadas/actions.ts` — server action wrapper de `getRingingCalls` (create).
- `src/app/(app)/_components/incoming-call-poller.tsx` — poller cliente + toast + sonido (create).
- `src/app/(app)/layout.tsx` — monta `<IncomingCallPoller />` (modify).
- `src/app/(app)/llamadas/page.tsx` — badge perdidas, empty states, agrupación por día, duración `—` (modify).
- `tests/unit/calls-store.test.ts` — tests de statusFor, SDP, getRingingCalls (modify).
- `tests/unit/webhook-call.test.ts` — test de captura de SDP en handleCallEvent (modify).

---

## Task 1: Migración 0010 — columnas SDP

**Files:**
- Modify: `src/lib/db/schema/domain.ts:312-331` (tabla `calls`)
- Create: `drizzle/migrations/0010_*.sql` (generada)

- [ ] **Step 1: Añadir columnas al schema**

En `src/lib/db/schema/domain.ts`, dentro de `export const calls = sqliteTable("calls", { ... })`, después de `endedAt: integer("ended_at", { mode: "timestamp" }),` añade:

```ts
    sdp: text("sdp"),
    sdpType: text("sdp_type"),
```

- [ ] **Step 2: Generar la migración**

Run: `cd ~/Documents/wa-blast && bunx drizzle-kit generate`
Expected: crea `drizzle/migrations/0010_*.sql` con `ALTER TABLE calls ADD column sdp text;` y `ALTER TABLE calls ADD column sdp_type text;`

- [ ] **Step 3: Verificar typecheck**

Run: `bun run typecheck`
Expected: PASS (sin errores nuevos).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations
git commit -m "feat(llamadas): columnas sdp/sdp_type en tabla calls (mig 0010)"
```

---

## Task 2: Capturar el SDP en el webhook

**Files:**
- Modify: `src/lib/meta/webhook.ts:62-74` (schema `calls[]`)
- Modify: `src/lib/calls/store.ts:6-58` (`CallEvent` + `recordCallEvent`)
- Modify: `src/lib/meta/webhook-handlers.ts:130-152` (`handleCallEvent`)
- Test: `tests/unit/webhook-call.test.ts`, `tests/unit/calls-store.test.ts`

- [ ] **Step 1: Test que falla — store persiste SDP**

En `tests/unit/calls-store.test.ts`, dentro de `describe("calls store", ...)`, añade:

```ts
  it("connect con SDP persiste sdp/sdpType y no los pisa con null en terminate", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.S", direction: "in", event: "connect", sdp: "v=0...", sdpType: "offer", ts: new Date(1000) });
    let rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.S"));
    expect(rows[0].sdp).toBe("v=0...");
    expect(rows[0].sdpType).toBe("offer");
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.S", direction: "in", event: "terminate", durationSec: 5, ts: new Date(2000) });
    rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.S"));
    expect(rows[0].sdp).toBe("v=0...");
  });
```

- [ ] **Step 2: Run test — debe fallar**

Run: `bun run test -- calls-store`
Expected: FAIL (`sdp`/`sdpType` no existen en `CallEvent` → error de tipo o columnas null).

- [ ] **Step 3: Extender `CallEvent` y `recordCallEvent`**

En `src/lib/calls/store.ts`, en el tipo `CallEvent` añade tras `durationSec?: number;`:

```ts
  sdp?: string;
  sdpType?: string;
```

En `recordCallEvent`, en la rama `existing` (update), cambia el `.set({...})` para preservar SDP y solo escribirlo si llega:

```ts
      .set({
        status,
        durationSec: e.durationSec ?? existing.durationSec ?? null,
        endedAt: e.event === "terminate" ? e.ts : existing.endedAt,
        sdp: e.sdp ?? existing.sdp ?? null,
        sdpType: e.sdpType ?? existing.sdpType ?? null,
      })
```

En el `db.insert(calls).values({...})`, añade tras `endedAt: ...,`:

```ts
    sdp: e.sdp ?? null,
    sdpType: e.sdpType ?? null,
```

- [ ] **Step 4: Run test — debe pasar**

Run: `bun run test -- calls-store`
Expected: PASS.

- [ ] **Step 5: Test que falla — webhook extrae session**

En `tests/unit/webhook-call.test.ts`, extiende la interfaz `CallPayload` con `session?: { sdp?: string; sdp_type?: string };` y añade el test:

```ts
  it("captura session.sdp del connect", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload: CallPayload = {
      id: "wacid.Z",
      from: "57300",
      event: "connect",
      timestamp: "1700000000",
      direction: "USER_INITIATED",
      session: { sdp: "v=0 offer", sdp_type: "offer" },
    };
    await handleCallEvent(db, "o1", payload);
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.Z"));
    expect(rows[0].sdp).toBe("v=0 offer");
    expect(rows[0].sdpType).toBe("offer");
  });
```

- [ ] **Step 6: Run test — debe fallar**

Run: `bun run test -- webhook-call`
Expected: FAIL (`handleCallEvent` ignora `session`).

- [ ] **Step 7: Extender schema del webhook**

En `src/lib/meta/webhook.ts`, dentro del objeto de `calls[]` (tras `duration: z.number().optional(),`) añade:

```ts
                  session: z.object({
                    sdp: z.string().optional(),
                    sdp_type: z.string().optional(),
                  }).optional(),
```

- [ ] **Step 8: Pasar el SDP en `handleCallEvent`**

En `src/lib/meta/webhook-handlers.ts`, amplía la firma del parámetro `call` con `session?: { sdp?: string; sdp_type?: string }` y pasa los valores a `recordCallEvent` añadiendo:

```ts
    sdp: call.session?.sdp,
    sdpType: call.session?.sdp_type,
```

- [ ] **Step 9: Run tests — deben pasar**

Run: `bun run test -- webhook-call calls-store`
Expected: PASS (todos).

- [ ] **Step 10: Commit**

```bash
git add src/lib/meta/webhook.ts src/lib/meta/webhook-handlers.ts src/lib/calls/store.ts tests/unit/webhook-call.test.ts tests/unit/calls-store.test.ts
git commit -m "feat(llamadas): capturar y persistir el SDP del connect en el webhook"
```

---

## Task 3: Endurecer el mapeo de estados

**Files:**
- Modify: `src/lib/calls/store.ts:18-24` (`statusFor`)
- Test: `tests/unit/calls-store.test.ts`

- [ ] **Step 1: Tests que fallan — ramas de statusFor y orden de eventos**

En `tests/unit/calls-store.test.ts` añade:

```ts
  it("terminate con status reject/fail mapea a rejected/failed; no-answer a missed", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "r1", direction: "in", event: "terminate", status: "REJECTED", ts: new Date() });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "f1", direction: "in", event: "terminate", status: "FAILED", ts: new Date() });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "n1", direction: "in", event: "terminate", status: "NO_ANSWER", ts: new Date() });
    expect((await db.select().from(calls).where(eq(calls.wacid, "r1")))[0].status).toBe("rejected");
    expect((await db.select().from(calls).where(eq(calls.wacid, "f1")))[0].status).toBe("failed");
    expect((await db.select().from(calls).where(eq(calls.wacid, "n1")))[0].status).toBe("missed");
  });
  it("connect tras terminate no revive ringing", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "ord", direction: "in", event: "terminate", durationSec: 0, ts: new Date(2000) });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "ord", direction: "in", event: "connect", ts: new Date(1000) });
    expect((await db.select().from(calls).where(eq(calls.wacid, "ord")))[0].status).toBe("missed");
  });
```

- [ ] **Step 2: Run tests — deben fallar**

Run: `bun run test -- calls-store`
Expected: FAIL (el `connect` tras `terminate` actualiza a `ringing`).

- [ ] **Step 3: Refinar `statusFor` y proteger estado terminal**

En `src/lib/calls/store.ts`, deja `statusFor` así (cubre no-answer/expired/missed explícitos):

```ts
function statusFor(e: CallEvent): "ringing" | "missed" | "completed" | "rejected" | "failed" {
  if (e.event === "connect") return "ringing";
  const s = (e.status ?? "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("no_answer") || s.includes("no-answer") || s.includes("miss") || s.includes("expire") || s.includes("timeout")) return "missed";
  if ((e.durationSec ?? 0) > 0) return "completed";
  return "missed";
}
```

En `recordCallEvent`, en la rama `existing` (update), protege el estado terminal: un `connect` que llega tarde no debe pisar un estado ya terminal. Reemplaza la línea `status,` dentro del `.set({...})` por:

```ts
        status: existing.status === "ringing" ? status : existing.status,
```

(Si el registro existente ya está en un estado terminal — missed/completed/rejected/failed — se conserva; solo se actualiza desde `ringing`.)

- [ ] **Step 4: Run tests — deben pasar**

Run: `bun run test -- calls-store`
Expected: PASS (todos, incluidos los previos del Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calls/store.ts tests/unit/calls-store.test.ts
git commit -m "fix(llamadas): mapeo de estados robusto (reject/fail/no-answer) + estado terminal no revive a ringing"
```

---

## Task 4: `getRingingCalls` — fuente de la notificación

**Files:**
- Modify: `src/lib/calls/store.ts` (añadir `getRingingCalls` al final)
- Test: `tests/unit/calls-store.test.ts`

- [ ] **Step 1: Test que falla**

En `tests/unit/calls-store.test.ts` añade el import de `getRingingCalls` a la línea de import existente de `@/lib/calls/store` y el test:

```ts
  it("getRingingCalls solo trae entrantes en ringing dentro de la ventana", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const now = new Date();
    const old = new Date(now.getTime() - 5 * 60_000);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "live", direction: "in", event: "connect", ts: now });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57301", wacid: "stale", direction: "in", event: "connect", ts: old });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57302", wacid: "done", direction: "in", event: "terminate", durationSec: 9, ts: now });
    const ringing = await getRingingCalls(db, "o1");
    expect(ringing.map((r) => r.id).sort()).toEqual((await db.select().from(calls).where(eq(calls.wacid, "live"))).map((r) => r.id));
  });
```

- [ ] **Step 2: Run test — debe fallar**

Run: `bun run test -- calls-store`
Expected: FAIL (`getRingingCalls` no existe).

- [ ] **Step 3: Implementar `getRingingCalls`**

En `src/lib/calls/store.ts`, al final del archivo añade (reutiliza `desc`, `and`, `eq`, `gte`, `contacts`, `conversations` ya importados; añade `gte` al import de `drizzle-orm` si falta):

```ts
export type RingingCall = {
  id: string;
  phone: string;
  contactName: string | null;
  conversationId: string;
  createdAt: Date;
};

export async function getRingingCalls(db: DB, orgId: string, windowSec = 90): Promise<RingingCall[]> {
  const since = new Date(Date.now() - windowSec * 1000);
  return db
    .select({
      id: calls.id,
      phone: calls.phone,
      contactName: contacts.name,
      conversationId: calls.conversationId,
      createdAt: calls.createdAt,
    })
    .from(calls)
    .leftJoin(conversations, eq(calls.conversationId, conversations.id))
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(and(eq(calls.orgId, orgId), eq(calls.direction, "in"), eq(calls.status, "ringing"), gte(calls.createdAt, since)))
    .orderBy(desc(calls.createdAt));
}
```

- [ ] **Step 4: Run test — debe pasar**

Run: `bun run test -- calls-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calls/store.ts tests/unit/calls-store.test.ts
git commit -m "feat(llamadas): getRingingCalls (entrantes en ringing dentro de ventana)"
```

---

## Task 5: Notificación de llamada entrante (poller + toast + sonido)

**Files:**
- Create: `src/app/(app)/llamadas/actions.ts`
- Create: `src/app/(app)/_components/incoming-call-poller.tsx`
- Modify: `src/app/(app)/layout.tsx` (montar el poller)

- [ ] **Step 1: Server action wrapper**

Crea `src/app/(app)/llamadas/actions.ts`:

```ts
"use server";

import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getRingingCalls, type RingingCall } from "@/lib/calls/store";

export async function pollRingingCallsAction(): Promise<RingingCall[]> {
  const { orgId } = await requireOrg();
  return getRingingCalls(db, orgId);
}
```

- [ ] **Step 2: Componente poller cliente**

Crea `src/app/(app)/_components/incoming-call-poller.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pollRingingCallsAction } from "../llamadas/actions";

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch {
    // autoplay bloqueado o sin Web Audio: notificación silenciosa
  }
}

export function IncomingCallPoller() {
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.hidden) return;
      try {
        const ringing = await pollRingingCallsAction();
        if (cancelled) return;
        for (const call of ringing) {
          if (seen.current.has(call.id)) continue;
          seen.current.add(call.id);
          beep();
          toast(`📞 Llamada entrante de ${call.contactName || call.phone}`, {
            description: call.phone,
            action: { label: "Ver", onClick: () => router.push(`/inbox/${call.conversationId}`) },
            duration: 20000,
          });
        }
      } catch {
        // red caída: el próximo tick reintenta
      }
    }
    const interval = setInterval(tick, 5000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
```

- [ ] **Step 3: Montar el poller en el layout**

En `src/app/(app)/layout.tsx`, importa el componente:

```tsx
import { IncomingCallPoller } from "./_components/incoming-call-poller";
```

y móntalo junto al `<Toaster ... />` (línea ~140), inmediatamente antes o después:

```tsx
      <IncomingCallPoller />
      <Toaster richColors position="top-right" />
```

- [ ] **Step 4: Verificar typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/llamadas/actions.ts" "src/app/(app)/_components/incoming-call-poller.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat(llamadas): notificación en vivo de llamada entrante (poller + toast + beep)"
```

---

## Task 6: UI `/llamadas` — badge perdidas, empty states, agrupación por día, duración `—`

**Files:**
- Modify: `src/app/(app)/llamadas/page.tsx`

- [ ] **Step 1: Contar perdidas y agrupar por día**

En `src/app/(app)/llamadas/page.tsx`, tras `const calls = await listCalls(db, orgId, { status, direction, q });`, añade el conteo de perdidas (independiente del filtro activo) y un agrupador por día:

```ts
  const missedCount = (await listCalls(db, orgId, { status: "missed" })).length;

  function dayLabel(d: Date): string {
    const now = new Date();
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return "Hoy";
    if (sameDay(d, yesterday)) return "Ayer";
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  }

  const groups: { label: string; items: typeof calls }[] = [];
  for (const call of calls) {
    const label = dayLabel(new Date(call.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(call);
    else groups.push({ label, items: [call] });
  }
```

- [ ] **Step 2: Badge en el filtro "Perdidas"**

Localiza el `filters` array y el `.map` que pinta los filtros. Sustituye el contenido del `<Link>` de cada filtro para que el de "Perdidas" muestre un badge cuando `missedCount > 0`. Cambia el render del label por:

```tsx
            {filter.label}
            {filter.label === "Perdidas" && missedCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                {missedCount}
              </span>
            )}
```

- [ ] **Step 3: Empty state por filtro + duración `—`**

Reemplaza el texto del empty state genérico para que dependa del filtro:

```tsx
              <p className="text-sm text-muted-foreground">
                {q
                  ? "Sin llamadas encontradas"
                  : status === "missed"
                    ? "Sin llamadas perdidas"
                    : status === "completed"
                      ? "Sin llamadas contestadas"
                      : direction === "in"
                        ? "Sin llamadas entrantes"
                        : direction === "out"
                          ? "Sin llamadas salientes"
                          : "Sin llamadas todavía"}
              </p>
```

Y en `getDurationLabel`, devuelve `"—"` en vez de `null` cuando no hay duración, para que las contestadas sin duración muestren el guion:

```ts
  function getDurationLabel(durationSec: number | null) {
    if (!durationSec) return "—";
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
```

Ajusta el render de la duración para mostrarlo siempre (ya no condicionado a truthy): reemplaza el bloque `{getDurationLabel(call.durationSec) && (...)}` por:

```tsx
                    <div className="text-xs text-muted-foreground">{getDurationLabel(call.durationSec)}</div>
```

- [ ] **Step 4: Render por grupos de día**

Reemplaza el render de la lista (`<div className="space-y-2">{calls.map(...)}</div>`) por el render agrupado. Cada grupo lleva un encabezado de día y debajo sus items (reusa el mismo `<Link>` de item que ya existe):

```tsx
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  {group.label}
                </div>
                {group.items.map((call) => (
                  // ... (el MISMO <Link key={call.id} ...> ... </Link> que ya existía)
                ))}
              </div>
            ))}
          </div>
```

(Mueve el `<Link>` de item existente dentro de este `group.items.map`; no dupliques su markup, solo cámbialo de `calls.map` a `group.items.map`.)

- [ ] **Step 5: Verificar typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/llamadas/page.tsx"
git commit -m "feat(llamadas): badge de perdidas, empty states por filtro, agrupación por día, duración —"
```

---

## Task 7: Verificación final + review

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite completa**

Run: `bun run lint && bun run typecheck && bun run test`
Expected: todo verde. Apunta el número total de tests (debería subir ~6 respecto a los 210 de Fase 1).

- [ ] **Step 2: Code review**

Dispara el subagent `code-reviewer` sobre el diff de la rama (`git diff main...HEAD` o el diff acumulado de esta tanda). Resuelve cualquier hallazgo bloqueante con un commit adicional.

- [ ] **Step 3: (Tras aprobación) merge + deploy**

```bash
# en main, fast-forward de la rama de trabajo, luego:
bash deploy/deploy.sh
```

Verifica que la migración 0010 se aplica en el deploy y que el health check (`/login`) devuelve 200. Comprueba en luladev.com que `/llamadas` agrupa por día y que el badge de perdidas aparece.

---

## Self-Review

- **Cobertura del spec:**
  - Migración 0010 (sdp/sdp_type) → Task 1. ✔
  - Captura SDP en webhook (schema + handler + store) → Task 2. ✔
  - Notificación entrante (getRingingCalls + poller + toast + sonido, patrón polling) → Tasks 4 y 5. ✔
  - Edge cases de estado + tests (reject/fail/no-answer/missed, orden de eventos, estado terminal) → Task 3. ✔
  - UI /llamadas (badge perdidas, empty states por filtro, agrupación por día, duración —) → Task 6. ✔
  - Verificación (lint/typecheck/test + code-reviewer + deploy con mig 0010) → Task 7. ✔
- **Sin placeholders:** todos los steps con código muestran el código real; comandos exactos con salida esperada.
- **Consistencia de tipos:** `CallEvent.sdp/sdpType` (Task 2) ↔ `recordCallEvent` insert/update (Task 2) ↔ columnas `sdp/sdp_type` (Task 1). `getRingingCalls`/`RingingCall` (Task 4) ↔ `pollRingingCallsAction` (Task 5) ↔ consumo en `IncomingCallPoller` (Task 5). `statusFor` mantiene su firma; el cambio de estado-terminal vive en `recordCallEvent`.
