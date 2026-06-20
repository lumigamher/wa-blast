# Agente IA — Plan B: Integración (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Cablear el motor del agente (Plan A, ya en main) al WhatsApp real de Lula: cuando entra un mensaje y la org tiene el agente ON, el agente responde solo (con debounce); si un humano contesta, el agente se pausa en esa conversación; cada turno se registra en `agent_runs`.

**Architecture:** In-process. El webhook entrante (`handleInboundMessage`) encola un turno con debounce por conversación. El turno carga config+tools+provider, corre `runAgentLoop`, y envía la respuesta por la Meta API (`sendText`) registrándola como saliente. Escalación o respuesta humana → `conversations.agentPaused`.

**Tech Stack:** TS, Drizzle(sqlite), Vitest. Reusa: `src/lib/agent/*` (Plan A), `src/lib/meta/client.ts` (`sendText`), `src/lib/inbox/store.ts` (`recordOutboundMessage`, `getOrCreateConversation`, message history), `src/lib/org/settings.ts` (`getOrgSettings`).

**Pre-existing (Plan A):** `conversations.agentPaused` (col), `agentRuns` (tabla), `getAgentConfig`, `resolveTools`, `getProvider`, `buildSystemPrompt`, `toLlmHistory`, `runAgentLoop`, `monthlyCostCop`/`isOverCostCap`.

---

## File Structure
- `src/lib/agent/pause.ts` — estado de handoff (pause/resume/isPaused) sobre `conversations.agentPaused`.
- `src/lib/agent/cost.ts` — `estimateCostCop(usage, provider, model)` (tarifa simple por token).
- `src/lib/agent/turn.ts` — `runAgentTurn(db, orgId, conversationId)`: orquesta un turno completo.
- `src/lib/agent/queue.ts` — debounce por conversación → llama `runAgentTurn`.
- `src/lib/meta/webhook-handlers.ts` (MOD) — tras persistir inbound, encola turno si aplica.
- inbox human-send action (MOD) — al enviar un humano, `pauseAgent`.

---

### Task 1: pause.ts (handoff)

**Files:** Create `src/lib/agent/pause.ts` + `src/lib/agent/pause.test.ts`.

- [ ] **Step 1: test que falla**
```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import { isPaused, pauseAgent, resumeAgent } from "./pause";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({
    id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date(),
  });
}

describe("agent pause", () => {
  it("pausa, consulta y reanuda", async () => {
    const { db } = makeTestDb();
    await seed(db);
    expect(await isPaused(db, "c1")).toBe(false);
    await pauseAgent(db, "c1");
    expect(await isPaused(db, "c1")).toBe(true);
    await resumeAgent(db, "c1");
    expect(await isPaused(db, "c1")).toBe(false);
  });
});
```
- [ ] **Step 2: run → FAIL** (`bun run test src/lib/agent/pause.test.ts`)
- [ ] **Step 3: implementar**
```ts
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";

export async function pauseAgent(db: DB, conversationId: string): Promise<void> {
  await db.update(conversations).set({ agentPaused: true }).where(eq(conversations.id, conversationId));
}

export async function resumeAgent(db: DB, conversationId: string): Promise<void> {
  await db.update(conversations).set({ agentPaused: false }).where(eq(conversations.id, conversationId));
}

export async function isPaused(db: DB, conversationId: string): Promise<boolean> {
  const row = (
    await db.select({ paused: conversations.agentPaused }).from(conversations).where(eq(conversations.id, conversationId))
  )[0];
  return row?.paused ?? false;
}
```
- [ ] **Step 4: run → PASS** + `bunx tsc --noEmit`
- [ ] **Step 5: commit** `git add src/lib/agent/pause.ts src/lib/agent/pause.test.ts && git commit -m "feat(agent): handoff pause/resume sobre conversations.agentPaused"`

---

### Task 2: cost.ts (estimación de costo por turno)

**Files:** Create `src/lib/agent/cost.ts` + test.

- [ ] **Step 1: test que falla**
```ts
import { describe, expect, it } from "vitest";
import { estimateCostCop } from "./cost";

describe("estimateCostCop", () => {
  it("estima > 0 según tokens y es determinístico", () => {
    const a = estimateCostCop({ promptTokens: 1000, completionTokens: 500 }, "openai", "gpt-5-mini");
    expect(a).toBeGreaterThan(0);
    expect(estimateCostCop({ promptTokens: 1000, completionTokens: 500 }, "openai", "gpt-5-mini")).toBe(a);
  });
  it("0 tokens → 0", () => {
    expect(estimateCostCop({ promptTokens: 0, completionTokens: 0 }, "anthropic", "x")).toBe(0);
  });
});
```
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implementar** (tarifas aproximadas COP por 1k tokens; editable luego)
```ts
type Usage = { promptTokens: number; completionTokens: number };

// COP por 1k tokens (in/out). Aproximado, conservador. Editable.
const RATES: Record<string, { in: number; out: number }> = {
  openai: { in: 1, out: 4 },
  anthropic: { in: 3, out: 15 },
};

export function estimateCostCop(usage: Usage, provider: string, _model: string): number {
  const rate = RATES[provider] ?? RATES.openai;
  const cop = (usage.promptTokens / 1000) * rate.in + (usage.completionTokens / 1000) * rate.out;
  return Math.round(cop);
}
```
- [ ] **Step 4: run → PASS** + tsc
- [ ] **Step 5: commit** `git add src/lib/agent/cost.ts src/lib/agent/cost.test.ts && git commit -m "feat(agent): estimación de costo por turno (COP/token)"`

---

### Task 3: turn.ts (orquestación de un turno)

**Files:** Create `src/lib/agent/turn.ts` + test. Depends on Plan A + Tasks 1-2.

**Design:** `runAgentTurn` recibe un "sender" inyectable (para testear sin Meta real).
```ts
export type AgentSender = (input: { to: string; body: string }) => Promise<{ wamid: string | null }>;
```
Lógica: cargar config → si `!enabled` salir; si `isPaused` salir; si `isOverCostCap` registrar run "capped" + enviar fallback (opcional) y salir; armar historial (últimos N mensajes de la conversación vía `toLlmHistory`), resolver tools, provider, system prompt; `runAgentLoop`; según status: `escalated` → `pauseAgent` + run "escalated" (no envía); `ok` con reply → `sender(...)` + `recordOutboundMessage(via agente)` + run "ok"; `capped` → fallback + run "capped". Siempre registra `agentRuns` con tokens+costo.

- [ ] **Step 1: test que falla** (usa fake provider + sender espía; siembra org, conversación, 1 mensaje inbound, agentConfig enabled, 1 tool builtin)
```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, agentRuns, agentTools, conversations, messages, organization } from "@/lib/db/schema";
import { makeFakeProvider } from "./testing/fake-provider";
import { runAgentTurn } from "./turn";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
  await db.insert(messages).values({ id: "m1", conversationId: "c1", orgId: "o1", direction: "in", wamid: "w1", type: "text", body: "hola", createdAt: new Date() });
  await db.insert(agentConfigs).values({ orgId: "o1", enabled: true, name: "Bot", systemPrompt: "Saluda", provider: "openai", model: "gpt-5-mini", temperature: 0, fallbackMessage: "ya te atienden", maxStepsPerTurn: 5, advancedMode: false, updatedAt: new Date() });
  await db.insert(agentTools).values({ id: randomUUID(), orgId: "o1", type: "builtin", key: "calcular_total", enabled: true, configJson: "{}", createdAt: new Date() });
}

describe("runAgentTurn", () => {
  it("agente ON: responde y registra run", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const provider = makeFakeProvider([{ text: "¡Hola! ¿En qué te ayudo?", toolCalls: [], usage: { promptTokens: 10, completionTokens: 5 } }]);
    const sender = vi.fn(async () => ({ wamid: "out1" }));
    await runAgentTurn(db, "o1", "c1", { provider, sender, to: "+57300" });
    expect(sender).toHaveBeenCalledWith({ to: "+57300", body: "¡Hola! ¿En qué te ayudo?" });
    const out = await db.select().from(messages).where(eq(messages.conversationId, "c1"));
    expect(out.some((m) => m.direction === "out" && m.body === "¡Hola! ¿En qué te ayudo?")).toBe(true);
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o1"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("ok");
  });

  it("agente OFF: no hace nada", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.update(agentConfigs).set({ enabled: false }).where(eq(agentConfigs.orgId, "o1"));
    const sender = vi.fn(async () => ({ wamid: "x" }));
    await runAgentTurn(db, "o1", "c1", { provider: makeFakeProvider([]), sender, to: "+57300" });
    expect(sender).not.toHaveBeenCalled();
  });

  it("conversación pausada: no responde", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.update(conversations).set({ agentPaused: true }).where(eq(conversations.id, "c1"));
    const sender = vi.fn(async () => ({ wamid: "x" }));
    await runAgentTurn(db, "o1", "c1", { provider: makeFakeProvider([]), sender, to: "+57300" });
    expect(sender).not.toHaveBeenCalled();
  });

  it("escalado: pausa y no envía", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(agentTools).values({ id: randomUUID(), orgId: "o1", type: "builtin", key: "escalar_a_humano", enabled: true, configJson: "{}", createdAt: new Date() });
    const provider = makeFakeProvider([{ text: null, toolCalls: [{ id: "t1", name: "escalar_a_humano", argsJson: JSON.stringify({ motivo: "pide humano" }) }], usage: { promptTokens: 3, completionTokens: 1 } }]);
    const sender = vi.fn(async () => ({ wamid: "x" }));
    await runAgentTurn(db, "o1", "c1", { provider, sender, to: "+57300" });
    expect(sender).not.toHaveBeenCalled();
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, "c1"));
    expect(conv.agentPaused).toBe(true);
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o1"));
    expect(runs[0].status).toBe("escalated");
  });
});
```
(añade `import { eq } from "drizzle-orm";` arriba del test.)
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implementar `turn.ts`**
```ts
import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { buildSystemPrompt, toLlmHistory } from "./context";
import { estimateCostCop } from "./cost";
import { getAgentConfig } from "./config";
import { isOverCostCap } from "./guardrails";
import { isPaused, pauseAgent } from "./pause";
import type { LlmProvider } from "./providers/types";
import { getProvider } from "./providers";
import { runAgentLoop } from "./runtime";
import { resolveTools } from "./tools/registry";
import type { DB } from "@/lib/db/client";
import { agentRuns, messages } from "@/lib/db/schema";
import { recordOutboundMessage } from "@/lib/inbox/store";

export type AgentSender = (input: { to: string; body: string }) => Promise<{ wamid: string | null }>;

const HISTORY_LIMIT = 20;

export async function runAgentTurn(
  db: DB,
  orgId: string,
  conversationId: string,
  deps: { provider?: LlmProvider; sender: AgentSender; to: string },
): Promise<void> {
  const config = await getAgentConfig(db, orgId);
  if (!config.enabled) return;
  if (await isPaused(db, conversationId)) return;

  const provider = deps.provider ?? getProvider({ provider: config.provider });
  const tools = await resolveTools(db, orgId);

  const rows = await db
    .select({ direction: messages.direction, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);
  const history = toLlmHistory(rows.reverse());

  // Tope de costo: registra run "capped" y no responde.
  if (await isOverCostCap(db, orgId, config.monthlyCostCapCop)) {
    await db.insert(agentRuns).values({
      id: randomUUID(), orgId, conversationId, stepsJson: "[]",
      promptTokens: 0, completionTokens: 0, costCop: 0, status: "capped", createdAt: new Date(),
    });
    return;
  }

  const res = await runAgentLoop({
    provider,
    model: config.model,
    temperature: config.temperature,
    system: buildSystemPrompt({ name: config.name, systemPrompt: config.systemPrompt }),
    history,
    tools,
    maxSteps: config.maxStepsPerTurn,
    ctx: { db, orgId, conversationId },
  });

  const costCop = estimateCostCop(res.usage, config.provider, config.model);

  if (res.status === "escalated") {
    await pauseAgent(db, conversationId);
  } else if (res.status === "ok" && res.reply) {
    const sent = await deps.sender({ to: deps.to, body: res.reply });
    await recordOutboundMessage(db, {
      orgId, conversationId, wamid: sent.wamid, type: "text", body: res.reply,
      status: sent.wamid ? "sent" : "failed",
    });
  } else if (res.status === "capped") {
    await deps.sender({ to: deps.to, body: config.fallbackMessage });
  }

  await db.insert(agentRuns).values({
    id: randomUUID(), orgId, conversationId, stepsJson: JSON.stringify(res.steps),
    promptTokens: res.usage.promptTokens, completionTokens: res.usage.completionTokens,
    costCop, status: res.status, createdAt: new Date(),
  });
}
```
- [ ] **Step 4: run → PASS** (4 tests) + tsc + lint
- [ ] **Step 5: commit** `git add src/lib/agent/turn.ts src/lib/agent/turn.test.ts && git commit -m "feat(agent): runAgentTurn — orquesta un turno (config/pausa/costo/envío/run)"`

---

### Task 4: queue.ts (debounce por conversación)

**Files:** Create `src/lib/agent/queue.ts` + test (con `vi.useFakeTimers()`).

- [ ] **Step 1: test que falla**
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetQueue, enqueueAgentTurn } from "./queue";

describe("agent queue debounce", () => {
  beforeEach(() => { vi.useFakeTimers(); __resetQueue(); });
  afterEach(() => { vi.useRealTimers(); });

  it("agrupa ráfaga: ejecuta el runner una vez tras el silencio", async () => {
    const runner = vi.fn(async () => {});
    enqueueAgentTurn("c1", runner, 2000);
    enqueueAgentTurn("c1", runner, 2000);
    enqueueAgentTurn("c1", runner, 2000);
    expect(runner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("conversaciones distintas son independientes", async () => {
    const r1 = vi.fn(async () => {});
    const r2 = vi.fn(async () => {});
    enqueueAgentTurn("c1", r1, 1000);
    enqueueAgentTurn("c2", r2, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(r1).toHaveBeenCalledTimes(1);
    expect(r2).toHaveBeenCalledTimes(1);
  });
});
```
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implementar**
```ts
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce por conversación: reinicia el temporizador en cada mensaje; al pasar
 *  `delayMs` de silencio, corre `runner` una vez. */
export function enqueueAgentTurn(
  conversationId: string,
  runner: () => Promise<void>,
  delayMs: number,
): void {
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    timers.delete(conversationId);
    void runner().catch((e) => console.error("[agent] turn error", e));
  }, delayMs);
  timers.set(conversationId, t);
}

/** Solo para tests. */
export function __resetQueue(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
```
- [ ] **Step 4: run → PASS** + tsc
- [ ] **Step 5: commit** `git add src/lib/agent/queue.ts src/lib/agent/queue.test.ts && git commit -m "feat(agent): cola con debounce por conversación"`

---

### Task 5: Hook en el webhook entrante

**Files:** Modify `src/lib/meta/webhook-handlers.ts`. Create `src/lib/agent/dispatch.ts` (puente que arma el sender real y dispara el turno) + test.

**dispatch.ts** aísla la construcción del sender (Meta) y el gating de "encolar o no", para que `handleInboundMessage` solo llame una función.
- [ ] **Step 1: test de `maybeDispatchAgentTurn` que falla** (org con agente OFF → no encola; ON+no pausada → encola). Usa el `enqueueAgentTurn` real con delay 0 y `vi.advanceTimersByTimeAsync` o inyecta un enqueue espía. Implementación sugerida: `maybeDispatchAgentTurn(db, orgId, conversationId, phone, { enqueue })` donde `enqueue` por defecto es el real; en test se inyecta espía.
```ts
import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, conversations, organization } from "@/lib/db/schema";
import { maybeDispatchAgentTurn } from "./dispatch";

async function seed(db, enabled) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
  await db.insert(agentConfigs).values({ orgId: "o1", enabled, name: "B", systemPrompt: "", provider: "openai", model: "gpt-5-mini", temperature: 0, fallbackMessage: "x", maxStepsPerTurn: 5, advancedMode: false, updatedAt: new Date() });
}

describe("maybeDispatchAgentTurn", () => {
  it("encola si agente ON y no pausado", async () => {
    const { db } = makeTestDb(); await seed(db, true);
    const enqueue = vi.fn();
    await maybeDispatchAgentTurn(db, "o1", "c1", "+57300", { enqueue });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it("no encola si agente OFF", async () => {
    const { db } = makeTestDb(); await seed(db, false);
    const enqueue = vi.fn();
    await maybeDispatchAgentTurn(db, "o1", "c1", "+57300", { enqueue });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
```
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implementar `dispatch.ts`**
```ts
import { getAgentConfig } from "./config";
import { isPaused } from "./pause";
import { enqueueAgentTurn } from "./queue";
import { runAgentTurn, type AgentSender } from "./turn";
import { getProvider } from "./providers";
import type { DB } from "@/lib/db/client";
import { db as defaultDb } from "@/lib/db/client";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings } from "@/lib/meta/graph";
import { sendText } from "@/lib/meta/client";

const DEBOUNCE_MS = 6000;

export async function maybeDispatchAgentTurn(
  db: DB,
  orgId: string,
  conversationId: string,
  phone: string,
  deps?: { enqueue?: (id: string, runner: () => Promise<void>, delayMs: number) => void },
): Promise<void> {
  const config = await getAgentConfig(db, orgId);
  if (!config.enabled) return;
  if (await isPaused(db, conversationId)) return;

  const enqueue = deps?.enqueue ?? enqueueAgentTurn;
  enqueue(conversationId, () => runRealTurn(orgId, conversationId, phone), DEBOUNCE_MS);
}

async function runRealTurn(orgId: string, conversationId: string, phone: string): Promise<void> {
  const settings = await getOrgSettings(defaultDb, orgId);
  const creds = credsFromSettings(settings);
  const sender: AgentSender = async ({ to, body }) => {
    if (!creds) return { wamid: null };
    const res = await sendText(settings, { to, body });
    return { wamid: "wamid" in res ? res.wamid : null };
  };
  const config = await getAgentConfig(defaultDb, orgId);
  await runAgentTurn(defaultDb, orgId, conversationId, {
    provider: getProvider({ provider: config.provider }),
    sender,
    to: phone,
  });
}
```
IMPORTANTE: verifica las firmas reales de `getOrgSettings`, `credsFromSettings` y `sendText` (la `settings` que pasa a `sendText` debe ser `DecryptedSettings`). Ajusta el puente si `getOrgSettings` ya devuelve el shape decriptado.
- [ ] **Step 4: run → PASS** + tsc
- [ ] **Step 5: hook en `webhook-handlers.ts`** — tras `recordInboundMessage(...)` dentro de `handleInboundMessage`, añade (solo para mensajes de texto entrantes, no reacciones/estados): obtener convId con `getOrCreateConversation(db, orgId, phone, ts, profileName)` (idempotente, ya importado) y llamar `await maybeDispatchAgentTurn(db, orgId, conv.id, phone)` envuelto en try/catch (no romper el webhook). Importa `maybeDispatchAgentTurn`.
- [ ] **Step 6: tsc + lint + `bun run test`** verde.
- [ ] **Step 7: commit** `git add src/lib/agent/dispatch.ts src/lib/agent/dispatch.test.ts src/lib/meta/webhook-handlers.ts && git commit -m "feat(agent): dispatch desde webhook entrante (debounce + gating ON/pausa)"`

---

### Task 6: Handoff — pausar al responder un humano

**Files:** Modify la server action del inbox que envía un mensaje humano (localizar con `grep -rn "recordOutboundMessage\|sendText" src/app/(app)/inbox`).

- [ ] **Step 1:** localizar la acción de envío manual (la que el agente humano usa en el inbox). Leerla.
- [ ] **Step 2:** tras enviar con éxito, llamar `await pauseAgent(db, conversationId)` (import desde `@/lib/agent/pause`). Esto pausa al agente en esa conversación cuando un humano toma el control. (El envío del propio agente NO pasa por esta acción, así que no se auto-pausa.)
- [ ] **Step 3:** añadir/ajustar un test de la acción si existe; si no, test mínimo de que enviar marca `agentPaused=true`.
- [ ] **Step 4:** tsc + lint + tests verdes.
- [ ] **Step 5: commit** `git commit -am "feat(agent): handoff — respuesta humana pausa al agente en la conversación"`

---

### Task 7: Gauntlet integración
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` — todo verde.
- [ ] commit si hubo autofix.

---

## Self-Review
- Cobertura: hook webhook (T5), debounce (T4), turno completo con config/pausa/costo/envío/run (T3), pause/resume (T1), costo (T2), handoff humano (T6). Gating ON + pausa respetados en dispatch y turn.
- Tipos: `AgentSender` consistente entre turn.ts y dispatch.ts. `runAgentTurn` firma usada igual en test y dispatch.
- Riesgos: el `sender` real depende de las firmas de `getOrgSettings`/`credsFromSettings`/`sendText` (el implementer debe verificarlas en T5). El debounce in-memory se pierde en reinicio (aceptable v1; un turno encolado se re-dispara con el siguiente mensaje). 24h-window: si el agente intenta texto libre fuera de ventana, `sendText` devolverá error de Meta y el run quedará registrado; manejo fino de ventana queda para iteración.
- Fuera de alcance (Plan C): panel `/configuracion/agente`, módulo gateable "agente", plantillas, vista de `agent_runs`.

## Siguiente: Plan C — Panel + gating.
