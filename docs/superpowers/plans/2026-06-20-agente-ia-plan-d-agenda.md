# Agente IA — Plan D: Agenda (calendario) modular (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Dar al agente la capacidad de **consultar disponibilidad y agendar citas** en el calendario de cada org, con una **abstracción de provider** (modular) cuya primera implementación es **Cal.com** (fase 1); Google/Calendly se enchufan después sin tocar tools ni runtime.

**Architecture:** Igual filosofía que los LLM providers. Interfaz `CalendarProvider` { getSlots, createBooking }. Impl `calcom.ts` (fase 1). `getCalendarProvider(provider, creds, config)` selecciona. Config por org en `agent_calendar` (credenciales encriptadas, flexible por provider). Dos tools built-in (`consultar_disponibilidad`, `agendar_cita`) leen la config de la org y usan el provider — provider-agnósticas. Panel: sección "Calendario".

**Tech Stack:** TS, Drizzle(sqlite), Vitest. Reusa: `src/lib/crypto/encrypt.ts` (`encrypt(plaintext)`/`decrypt(encoded)`), patrón `AgentTool` (Plan A), panel `/configuracion/agente` (Plan C).

**Decisión (Luis):** Cal.com/Calendly por API key por org en fase 1, PERO arquitectura modular para que integren fácilmente sus calendarios/cuentas después.

---

## File Structure
- `src/lib/db/schema/domain.ts` (MOD) — tabla `agentCalendar`.
- `src/lib/agent/integrations/calendar/types.ts` — interfaz `CalendarProvider` + tipos.
- `src/lib/agent/integrations/calendar/calcom.ts` — impl Cal.com.
- `src/lib/agent/integrations/calendar/index.ts` — `getCalendarProvider`.
- `src/lib/agent/integrations/calendar/config.ts` — `getCalendarConfig`/`saveCalendarConfig` (cifrado).
- `src/lib/agent/tools/builtin/consultar-disponibilidad.ts` + `agendar-cita.ts`.
- `src/lib/agent/tools/registry.ts` (MOD) — añade las 2 tools a `BUILTIN_TOOLS`.
- Panel: `_calendar.tsx` (client) + acción en `configuracion/agente/actions.ts` + render en `page.tsx`.

---

### Task 1: Schema `agent_calendar`

**Files:** Modify `src/lib/db/schema/domain.ts`.

- [ ] **Step 1:** Tras `agentRuns`, añade:
```ts
export const agentCalendar = sqliteTable("agent_calendar", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["calcom", "calendly", "google"] })
    .notNull()
    .default("calcom"),
  // JSON encriptado con las credenciales (forma depende del provider).
  credentialsEnc: text("credentials_enc"),
  // JSON con config no secreta (eventTypeId, timezone, etc.).
  configJson: text("config_json").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```
- [ ] **Step 2:** `bun run db:generate` → migración 0016. `bun run db:migrate`. `bunx tsc --noEmit` clean.
- [ ] **Step 3: commit** `git add src/lib/db/schema/domain.ts drizzle/migrations && git commit -m "feat(agent): tabla agent_calendar (config de calendario por org, cifrada)"`

---

### Task 2: Interfaz CalendarProvider

**Files:** Create `src/lib/agent/integrations/calendar/types.ts`.

- [ ] **Step 1:** 
```ts
export type CalendarSlot = { startISO: string; endISO: string };

export type BookingInput = {
  startISO: string;
  name: string;
  email: string;
  timezone: string;
};

export type BookingResult =
  | { ok: true; bookingId: string; startISO: string }
  | { ok: false; error: string };

export interface CalendarProvider {
  /** Slots disponibles entre dos fechas (ISO). */
  getSlots(input: { fromISO: string; toISO: string; timezone: string }): Promise<CalendarSlot[]>;
  /** Crea una reserva en un slot. */
  createBooking(input: BookingInput): Promise<BookingResult>;
}
```
- [ ] **Step 2:** `bunx tsc --noEmit` clean. **commit** `git add src/lib/agent/integrations/calendar/types.ts && git commit -m "feat(agent): interfaz CalendarProvider (modular)"`

---

### Task 3: Provider Cal.com

**Files:** Create `calcom.ts` + test. VERIFICAR la API v2 de Cal.com (endpoints `slots` y `bookings`) — usa Context7 (`/calcom/cal.com` o docs cal.com) o la doc oficial; ajusta el shape real. Diseño de referencia (auth con header `Authorization: Bearer <apiKey>` y `cal-api-version`):

- [ ] **Step 1: test** `calcom.test.ts` (fetch mock):
```ts
import { describe, expect, it, vi } from "vitest";
import { makeCalcomProvider } from "./calcom";

describe("calcom provider", () => {
  it("getSlots mapea la respuesta a CalendarSlot[]", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { slots: { "2026-07-01": [{ time: "2026-07-01T15:00:00Z" }] } } }), { status: 200 }),
    );
    const p = makeCalcomProvider({ apiKey: "k", eventTypeId: 123, durationMin: 30 });
    const slots = await p.getSlots({ fromISO: "2026-07-01T00:00:00Z", toISO: "2026-07-02T00:00:00Z", timezone: "America/Bogota" });
    expect(slots[0].startISO).toBe("2026-07-01T15:00:00Z");
    expect(slots[0].endISO).toBe("2026-07-01T15:30:00Z");
    fetchMock.mockRestore();
  });

  it("createBooking devuelve ok con bookingId", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { uid: "bk_1", start: "2026-07-01T15:00:00Z" } }), { status: 201 }),
    );
    const p = makeCalcomProvider({ apiKey: "k", eventTypeId: 123, durationMin: 30 });
    const r = await p.createBooking({ startISO: "2026-07-01T15:00:00Z", name: "Ana", email: "a@x.com", timezone: "America/Bogota" });
    expect(r).toEqual({ ok: true, bookingId: "bk_1", startISO: "2026-07-01T15:00:00Z" });
    fetchMock.mockRestore();
  });

  it("error de API → BookingResult ok:false", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    const p = makeCalcomProvider({ apiKey: "k", eventTypeId: 123, durationMin: 30 });
    const r = await p.createBooking({ startISO: "x", name: "A", email: "a@x.com", timezone: "UTC" });
    expect(r.ok).toBe(false);
    fetchMock.mockRestore();
  });
});
```
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implementar `calcom.ts`** — `makeCalcomProvider(cfg: { apiKey: string; eventTypeId: number; durationMin: number }): CalendarProvider`. `getSlots`: GET a la API de slots de Cal.com (eventTypeId, start, end, timeZone), aplanar el mapa fecha→slots a `CalendarSlot[]` calculando `endISO = startISO + durationMin`. `createBooking`: POST a bookings (eventTypeId, start, attendee {name,email,timeZone}); map a `BookingResult`. Timeout 8s con AbortController. Sin secretos en logs. **AJUSTA endpoints/headers/campos al contrato real de Cal.com v2 verificado.**
- [ ] **Step 4: run → PASS** + tsc. **commit** `git add src/lib/agent/integrations/calendar/calcom.ts src/lib/agent/integrations/calendar/calcom.test.ts && git commit -m "feat(agent): provider de calendario Cal.com"`

---

### Task 4: Selector `getCalendarProvider`

**Files:** Create `index.ts` + test.

- [ ] **Step 1: test** que `getCalendarProvider("calcom", {apiKey,eventTypeId,durationMin})` devuelve un objeto con `getSlots`/`createBooking`; provider no soportado → throw.
- [ ] **Step 2: implementar**:
```ts
import { makeCalcomProvider } from "./calcom";
import type { CalendarProvider } from "./types";

export type CalendarSettings = {
  provider: "calcom" | "calendly" | "google";
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
};

export function getCalendarProvider(s: CalendarSettings): CalendarProvider {
  switch (s.provider) {
    case "calcom":
      return makeCalcomProvider({ apiKey: s.apiKey, eventTypeId: s.eventTypeId, durationMin: s.durationMin });
    default:
      throw new Error(`Provider de calendario no soportado aún: ${s.provider}`);
  }
}
```
- [ ] **Step 3: run → PASS** + tsc. **commit** `git commit -am "feat(agent): getCalendarProvider (selector modular)"`

---

### Task 5: Config de calendario por org (cifrado)

**Files:** Create `src/lib/agent/integrations/calendar/config.ts` + test.

- [ ] **Step 1: test** (cifra al guardar, descifra al leer; sin config → null):
```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getCalendarConfig, saveCalendarConfig } from "./config";

describe("calendar config", () => {
  it("guarda cifrado y relee", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveCalendarConfig(db, "o1", { provider: "calcom", apiKey: "secreta", eventTypeId: 42, durationMin: 30, timezone: "America/Bogota" });
    const cfg = await getCalendarConfig(db, "o1");
    expect(cfg?.apiKey).toBe("secreta");
    expect(cfg?.eventTypeId).toBe(42);
    expect(cfg?.timezone).toBe("America/Bogota");
  });
  it("sin config → null", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    expect(await getCalendarConfig(db, "o2")).toBeNull();
  });
});
```
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implementar** usando `encrypt`/`decrypt` de `@/lib/crypto/encrypt`. `credentialsEnc` = `encrypt(JSON.stringify({ apiKey }))`; `configJson` = `JSON.stringify({ eventTypeId, durationMin, timezone })`. `getCalendarConfig` descifra y combina; devuelve `null` si no hay fila o no hay credentialsEnc. Tipo de retorno: `{ provider, apiKey, eventTypeId, durationMin, timezone } | null`.
- [ ] **Step 4: run → PASS** + tsc. **commit** `git add src/lib/agent/integrations/calendar/config.ts src/lib/agent/integrations/calendar/config.test.ts && git commit -m "feat(agent): config de calendario por org (cifrada)"`

---

### Task 6: Tools `consultar_disponibilidad` y `agendar_cita`

**Files:** Create las 2 tools + tests. Usan `getCalendarConfig(ctx.db, ctx.orgId)`; si null → `{ ok:false, error:"calendario no configurado" }`. Construyen el provider con `getCalendarProvider`.

- [ ] **Step 1: test** de cada tool con la config sembrada y `fetch` mockeado (o mejor: inyectar un provider falso — pero las tools construyen el provider internamente; entonces mockear `fetch`). Verifica: disponibilidad devuelve slots; agendar devuelve confirmación; sin config → ok:false.
- [ ] **Step 2: implementar** `consultar-disponibilidad.ts`:
  - schema zod: `{ fecha?: string (YYYY-MM-DD), dias?: number (default 7) }`.
  - calcula fromISO (hoy o `fecha`) y toISO (+dias), llama `provider.getSlots`, devuelve `{ ok:true, data:{ slots: CalendarSlot[] (máx ~10) } }`.
  - `escalates: false`. jsonSchema correspondiente.
- [ ] **Step 3: implementar** `agendar-cita.ts`:
  - schema zod: `{ slotISO: string, nombre: string, email: string }`.
  - llama `provider.createBooking({ startISO: slotISO, name, email, timezone: cfg.timezone })`, mapea a ToolResult.
  - Acción sensible: la confirmación previa la gobierna el prompt del agente (v1).
- [ ] **Step 4:** registrar ambas en `BUILTIN_TOOLS` (registry.ts): `consultar_disponibilidad`, `agendar_cita`.
- [ ] **Step 5: run tests → PASS** + tsc + lint. **commit** `git add src/lib/agent/tools/builtin/consultar-disponibilidad.ts src/lib/agent/tools/builtin/agendar-cita.ts src/lib/agent/tools/builtin/*calendar*.test.ts src/lib/agent/tools/registry.ts && git commit -m "feat(agent): tools consultar_disponibilidad y agendar_cita (provider-agnósticas)"`

---

### Task 7: Panel — sección Calendario

**Files:** Modify `configuracion/agente/actions.ts` (+ `src/lib/agent/admin.ts` helper) y crear `_calendar.tsx`; render en `page.tsx`.

- [ ] **Step 1:** helper `saveCalendar(db, orgId, input)` en `admin.ts` (valida eventTypeId número, provider permitido) → `saveCalendarConfig`. Test mínimo.
- [ ] **Step 2:** action `saveCalendarAction(input)` (requireOrg + helper + revalidate).
- [ ] **Step 3:** `_calendar.tsx` (client): provider select (v1 solo "Cal.com" activo; otros "próximamente" disabled), API key (password input), eventTypeId (number), durationMin (number, default 30), timezone (input, default "America/Bogota"). Guardar → `saveCalendarAction`. Nota: muestra si ya hay credenciales guardadas (sin revelar la key — un check "configurado").
- [ ] **Step 4:** en `page.tsx`, carga estado de calendario (configurado sí/no, NO la key) y renderiza `<AgentCalendar configured={...} current={{provider,eventTypeId,durationMin,timezone}} />`. Recuerda activar las tools `consultar_disponibilidad`/`agendar_cita` en la sección de tools para que el agente las use.
- [ ] **Step 5:** tsc + lint + build (`/configuracion/agente` compila). **commit** `git add -A && git commit -m "feat(agent): panel — sección Calendario (provider + credenciales cifradas)"`

---

### Task 8: Gauntlet final
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` verde.

---

## Self-Review
- Modularidad: `CalendarProvider` + `getCalendarProvider` aíslan Cal.com; añadir Google/Calendly = nueva impl + caso en el switch + campos en `_calendar.tsx`. Tools y runtime no cambian.
- Seguridad: API key cifrada (`credentialsEnc`), nunca en logs ni enviada al cliente; el panel solo muestra "configurado".
- Determinismo: disponibilidad/booking pasan por código (provider), el LLM solo decide cuándo llamarlas y narra el resultado.
- Riesgo: el contrato REAL de la API de Cal.com v2 debe verificarse (Task 3) — endpoints/headers/campos pueden diferir del diseño de referencia; el test mockea la forma esperada, así que ALINEAR el mock con la API real al verificar.
- Confirmación de booking: v1 confía en el prompt; un guard de confirmación explícito (tool sensible) es iteración futura.

## Siguiente
Google Calendar / Calendly como nuevas impls de `CalendarProvider`. Luego: productos/ventas, RAG, ecommerce.
