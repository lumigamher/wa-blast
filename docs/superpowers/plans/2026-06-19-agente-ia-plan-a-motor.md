# Agente IA — Plan A: Motor del agente (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor agéntico multi-tenant de Lula: loop LLM↔tools determinístico, provider-agnóstico, configurable por organización — sin tocar aún el webhook de WhatsApp ni la UI.

**Architecture:** El LLM (temperatura baja) solo decide qué tool llamar y con qué args; el código ejecuta. Args validados con zod. Providers (OpenAI/Anthropic) detrás de una interfaz `LlmProvider`. Tools (built-in + conector HTTP) en un registry resuelto por org. El loop encadena tools hasta una respuesta final, con tope de pasos. Todo en `src/lib/agent/`, testeable con un `LlmProvider` falso (sin API real).

**Tech Stack:** TypeScript, Drizzle (sqlite/better-sqlite3), zod, Vitest, OpenAI SDK (ya en deps), Anthropic SDK (`@anthropic-ai/sdk`, se añade).

**Decisiones del spec** (`docs/superpowers/specs/2026-06-19-agente-ia-core-design.md`): asistente configurable por prompt; LLM+tools por org; híbrido built-in/HTTP; determinismo por split LLM/tools; in-process; módulo Premium (gating en Plan C).

---

## File Structure

Nuevos archivos (todos bajo `src/lib/agent/` salvo schema/migración):
- `src/lib/db/schema/domain.ts` (MOD) — tablas `agentConfigs`, `agentTools`, `agentRuns` + `conversations.agentPaused`.
- `src/lib/agent/config.ts` — CRUD de config por org.
- `src/lib/agent/providers/types.ts` — interfaz `LlmProvider` + tipos de mensajes/tool-calls/uso.
- `src/lib/agent/providers/openai.ts` — `LlmProvider` con OpenAI.
- `src/lib/agent/providers/anthropic.ts` — `LlmProvider` con Anthropic.
- `src/lib/agent/providers/index.ts` — `getProvider(config)`.
- `src/lib/agent/tools/types.ts` — `AgentTool`, `ToolResult`, `ToolContext`.
- `src/lib/agent/tools/builtin/calcular-total.ts`
- `src/lib/agent/tools/builtin/escalar-humano.ts`
- `src/lib/agent/tools/builtin/recopilar-datos.ts`
- `src/lib/agent/tools/http-connector.ts` — fábrica de tool desde config HTTP.
- `src/lib/agent/tools/registry.ts` — `resolveTools(db, orgId)`.
- `src/lib/agent/guardrails.ts` — topes (pasos, costo) + helpers.
- `src/lib/agent/context.ts` — `buildContext`.
- `src/lib/agent/runtime.ts` — `runAgentLoop`.
- `src/lib/agent/testing/fake-provider.ts` — provider scripteado para tests.
- Tests `*.test.ts` junto a cada módulo.

---

### Task 1: Schema — tablas del agente + flag de pausa

**Files:**
- Modify: `src/lib/db/schema/domain.ts` (añadir después de `flowResponses`)
- Modify: `src/lib/db/schema/domain.ts` (tabla `conversations`: añadir `agentPaused`)

- [ ] **Step 1: Añadir las tablas del agente**

En `src/lib/db/schema/domain.ts`, después de la tabla `flowResponses`, añade:

```ts
export const agentConfigs = sqliteTable("agent_configs", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  name: text("name").notNull().default("Asistente"),
  systemPrompt: text("system_prompt").notNull().default(""),
  provider: text("provider", { enum: ["openai", "anthropic"] })
    .notNull()
    .default("openai"),
  model: text("model").notNull().default("gpt-5-mini"),
  temperature: real("temperature").notNull().default(0.2),
  businessHoursJson: text("business_hours_json"),
  fallbackMessage: text("fallback_message")
    .notNull()
    .default("En un momento te atiende una persona del equipo."),
  maxStepsPerTurn: integer("max_steps_per_turn").notNull().default(5),
  monthlyCostCapCop: integer("monthly_cost_cap_cop"),
  templateId: text("template_id"),
  advancedMode: integer("advanced_mode", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const agentTools = sqliteTable(
  "agent_tools",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["builtin", "http"] }).notNull(),
    key: text("key").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    configJson: text("config_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("agent_tools_org_idx").on(t.orgId) }),
);

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    stepsJson: text("steps_json").notNull().default("[]"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costCop: integer("cost_cop").notNull().default(0),
    status: text("status", {
      enum: ["ok", "error", "capped", "escalated"],
    }).notNull(),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("agent_runs_org_idx").on(t.orgId, t.createdAt) }),
);
```

Verifica que `real` está importado de `drizzle-orm/sqlite-core` al inicio del archivo; si no, añádelo a la lista de imports.

- [ ] **Step 2: Añadir `agentPaused` a `conversations`**

Localiza la tabla `conversations` en el mismo archivo y añade esta columna junto a las demás (antes del `createdAt`):

```ts
  agentPaused: integer("agent_paused", { mode: "boolean" })
    .notNull()
    .default(false),
```

- [ ] **Step 3: Generar la migración**

Run: `bun run db:generate`
Expected: crea `drizzle/migrations/0015_*.sql` con `CREATE TABLE agent_configs/agent_tools/agent_runs` y `ALTER TABLE conversations ADD agent_paused`.

- [ ] **Step 4: Aplicar la migración local y verificar typecheck**

Run: `bun run db:migrate && bunx tsc --noEmit`
Expected: "migrations applied successfully" y tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations
git commit -m "feat(agent): schema agent_configs/agent_tools/agent_runs + conversations.agentPaused"
```

---

### Task 2: Config por org

**Files:**
- Create: `src/lib/agent/config.ts`
- Test: `src/lib/agent/config.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getAgentConfig, saveAgentConfig } from "./config";

async function org(db: ReturnType<typeof makeTestDb>["db"]) {
  await db
    .insert(organization)
    .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("agent config", () => {
  it("devuelve defaults cuando no existe", async () => {
    const { db } = makeTestDb();
    await org(db);
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.enabled).toBe(false);
    expect(cfg.provider).toBe("openai");
    expect(cfg.maxStepsPerTurn).toBe(5);
  });

  it("guarda y relee (upsert)", async () => {
    const { db } = makeTestDb();
    await org(db);
    await saveAgentConfig(db, "o1", { enabled: true, name: "Lula Bot" });
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.enabled).toBe(true);
    expect(cfg.name).toBe("Lula Bot");
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/config.test.ts`
Expected: FAIL ("Cannot find module './config'").

- [ ] **Step 3: Implementar `config.ts`**

```ts
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentConfigs } from "@/lib/db/schema";

export type AgentConfig = typeof agentConfigs.$inferSelect;
type AgentConfigPatch = Partial<typeof agentConfigs.$inferInsert>;

const DEFAULTS = {
  enabled: false,
  name: "Asistente",
  systemPrompt: "",
  provider: "openai" as const,
  model: "gpt-5-mini",
  temperature: 0.2,
  businessHoursJson: null,
  fallbackMessage: "En un momento te atiende una persona del equipo.",
  maxStepsPerTurn: 5,
  monthlyCostCapCop: null,
  templateId: null,
  advancedMode: false,
};

export async function getAgentConfig(db: DB, orgId: string): Promise<AgentConfig> {
  const row = (
    await db.select().from(agentConfigs).where(eq(agentConfigs.orgId, orgId))
  )[0];
  if (row) return row;
  return { orgId, updatedAt: new Date(), ...DEFAULTS };
}

export async function saveAgentConfig(
  db: DB,
  orgId: string,
  patch: AgentConfigPatch,
): Promise<void> {
  const now = new Date();
  await db
    .insert(agentConfigs)
    .values({ orgId, ...DEFAULTS, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: agentConfigs.orgId,
      set: { ...patch, updatedAt: now },
    });
}
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/config.ts src/lib/agent/config.test.ts
git commit -m "feat(agent): config por org (getAgentConfig/saveAgentConfig)"
```

---

### Task 3: Tipos del provider (`LlmProvider`)

**Files:**
- Create: `src/lib/agent/providers/types.ts`

- [ ] **Step 1: Escribir los tipos (sin test; es solo definiciones)**

```ts
export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type LlmToolSchema = {
  name: string;
  description: string;
  /** JSON Schema de los parámetros */
  parameters: Record<string, unknown>;
};

export type LlmToolCall = { id: string; name: string; argsJson: string };

export type LlmUsage = { promptTokens: number; completionTokens: number };

export type LlmResponse = {
  text: string | null;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
};

export interface LlmProvider {
  chat(input: {
    system: string;
    messages: LlmMessage[];
    tools: LlmToolSchema[];
    temperature: number;
    model: string;
  }): Promise<LlmResponse>;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/providers/types.ts
git commit -m "feat(agent): interfaz LlmProvider y tipos de mensajes/tool-calls"
```

---

### Task 4: Tipos de tools

**Files:**
- Create: `src/lib/agent/tools/types.ts`

- [ ] **Step 1: Escribir los tipos**

```ts
import type { z } from "zod";
import type { DB } from "@/lib/db/client";

export type ToolContext = {
  db: DB;
  orgId: string;
  conversationId: string;
};

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type AgentTool = {
  name: string;
  description: string;
  /** Validación de args (servidor). El LLM no la ve. */
  paramsSchema: z.ZodTypeAny;
  /** JSON Schema que SÍ ve el LLM (params). */
  jsonSchema: Record<string, unknown>;
  run(args: unknown, ctx: ToolContext): Promise<ToolResult>;
};
```

- [ ] **Step 2: Verificar typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/tools/types.ts
git commit -m "feat(agent): tipos de tools (AgentTool/ToolResult/ToolContext)"
```

---

### Task 5: Built-in `calcular_total` (tool determinística)

**Files:**
- Create: `src/lib/agent/tools/builtin/calcular-total.ts`
- Test: `src/lib/agent/tools/builtin/calcular-total.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { calcularTotal } from "./calcular-total";

const ctx = { db: {} as never, orgId: "o1", conversationId: "c1" };

describe("calcular_total", () => {
  it("suma exacta (cantidad * precioUnitario)", async () => {
    const r = await calcularTotal.run(
      {
        items: [
          { nombre: "Cerveza", cantidad: 3, precioUnitario: 2500 },
          { nombre: "Agua", cantidad: 2, precioUnitario: 1500 },
        ],
      },
      ctx,
    );
    expect(r).toEqual({
      ok: true,
      data: {
        total: 10500,
        desglose: [
          { nombre: "Cerveza", cantidad: 3, precioUnitario: 2500, subtotal: 7500 },
          { nombre: "Agua", cantidad: 2, precioUnitario: 1500, subtotal: 3000 },
        ],
      },
    });
  });

  it("rechaza args inválidos vía schema (validación externa)", () => {
    const bad = calcularTotal.paramsSchema.safeParse({ items: [] });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/tools/builtin/calcular-total.test.ts`
Expected: FAIL ("Cannot find module './calcular-total'").

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";
import type { AgentTool } from "../types";

const schema = z.object({
  items: z
    .array(
      z.object({
        nombre: z.string().min(1),
        cantidad: z.number().positive(),
        precioUnitario: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export const calcularTotal: AgentTool = {
  name: "calcular_total",
  description:
    "Calcula el total de una lista de items (cantidad x precio unitario). Úsalo SIEMPRE para sumar; nunca calcules tú.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string" },
            cantidad: { type: "number" },
            precioUnitario: { type: "number" },
          },
          required: ["nombre", "cantidad", "precioUnitario"],
        },
      },
    },
    required: ["items"],
  },
  async run(args) {
    const { items } = schema.parse(args);
    const desglose = items.map((i) => ({
      ...i,
      subtotal: i.cantidad * i.precioUnitario,
    }));
    const total = desglose.reduce((s, i) => s + i.subtotal, 0);
    return { ok: true, data: { total, desglose } };
  },
};
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/tools/builtin/calcular-total.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/builtin/calcular-total.ts src/lib/agent/tools/builtin/calcular-total.test.ts
git commit -m "feat(agent): tool built-in calcular_total (determinística)"
```

---

### Task 6: Built-in `escalar_a_humano`

**Files:**
- Create: `src/lib/agent/tools/builtin/escalar-humano.ts`
- Test: `src/lib/agent/tools/builtin/escalar-humano.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { escalarHumano } from "./escalar-humano";

describe("escalar_a_humano", () => {
  it("devuelve escalado con el motivo", async () => {
    const r = await escalarHumano.run(
      { motivo: "pide hablar con una persona" },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r).toEqual({
      ok: true,
      data: { escalado: true, motivo: "pide hablar con una persona" },
    });
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/tools/builtin/escalar-humano.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";
import type { AgentTool } from "../types";

const schema = z.object({ motivo: z.string().min(1) });

export const escalarHumano: AgentTool = {
  name: "escalar_a_humano",
  description:
    "Escala la conversación a un humano cuando el cliente lo pide o el tema sale de tu alcance. Tras llamarla, deja de responder.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { motivo: { type: "string" } },
    required: ["motivo"],
  },
  async run(args) {
    const { motivo } = schema.parse(args);
    return { ok: true, data: { escalado: true, motivo } };
  },
};
```

Nota: la PAUSA real de la conversación la aplica el runtime (Task 12) al detectar `escalar_a_humano`; esta tool solo señaliza.

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/tools/builtin/escalar-humano.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/builtin/escalar-humano.ts src/lib/agent/tools/builtin/escalar-humano.test.ts
git commit -m "feat(agent): tool built-in escalar_a_humano"
```

---

### Task 7: Built-in `recopilar_datos`

**Files:**
- Create: `src/lib/agent/tools/builtin/recopilar-datos.ts`
- Test: `src/lib/agent/tools/builtin/recopilar-datos.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { recopilarDatos } from "./recopilar-datos";

describe("recopilar_datos", () => {
  it("devuelve los campos recogidos", async () => {
    const r = await recopilarDatos.run(
      { campos: { nombre: "Ana", ciudad: "Cali" } },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r).toEqual({
      ok: true,
      data: { recogidos: { nombre: "Ana", ciudad: "Cali" } },
    });
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/tools/builtin/recopilar-datos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";
import type { AgentTool } from "../types";

const schema = z.object({
  campos: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const recopilarDatos: AgentTool = {
  name: "recopilar_datos",
  description:
    "Registra datos que el cliente proporcione (nombre, ciudad, etc.) como pares campo:valor.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { campos: { type: "object" } },
    required: ["campos"],
  },
  async run(args) {
    const { campos } = schema.parse(args);
    return { ok: true, data: { recogidos: campos } };
  },
};
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/tools/builtin/recopilar-datos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/builtin/recopilar-datos.ts src/lib/agent/tools/builtin/recopilar-datos.test.ts
git commit -m "feat(agent): tool built-in recopilar_datos"
```

---

### Task 8: Fábrica de conector HTTP

**Files:**
- Create: `src/lib/agent/tools/http-connector.ts`
- Test: `src/lib/agent/tools/http-connector.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it, vi } from "vitest";
import { makeHttpTool, type HttpConnectorConfig } from "./http-connector";

const cfg: HttpConnectorConfig = {
  name: "buscar_producto",
  description: "Busca un producto por nombre",
  method: "GET",
  urlTemplate: "https://api.tienda.com/productos",
  headers: {},
  auth: { type: "none" },
  params: [{ name: "q", type: "string", required: true, in: "query" }],
  responseMapping: null,
};

describe("http connector", () => {
  it("valida args, hace fetch y devuelve el JSON", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ nombre: "Cerveza", precio: 2500 }), {
          status: 200,
        }),
      );
    const tool = makeHttpTool(cfg);
    const r = await tool.run(
      { q: "cerveza" },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r).toEqual({ ok: true, data: { nombre: "Cerveza", precio: 2500 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tienda.com/productos?q=cerveza",
      expect.objectContaining({ method: "GET" }),
    );
    fetchMock.mockRestore();
  });

  it("rechaza args inválidos (param requerido faltante)", () => {
    const tool = makeHttpTool(cfg);
    expect(tool.paramsSchema.safeParse({}).success).toBe(false);
  });

  it("error de red → ToolResult ok:false", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("boom", { status: 500 }));
    const tool = makeHttpTool(cfg);
    const r = await tool.run(
      { q: "x" },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r.ok).toBe(false);
    fetchMock.mockRestore();
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/tools/http-connector.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";
import type { AgentTool, ToolResult } from "./types";

export type HttpParam = {
  name: string;
  type: "string" | "number";
  required: boolean;
  in: "query" | "path" | "body";
};

export type HttpConnectorConfig = {
  name: string;
  description: string;
  method: "GET" | "POST";
  urlTemplate: string;
  headers: Record<string, string>;
  auth: { type: "none" } | { type: "bearer"; token: string } | { type: "apiKey"; header: string; value: string };
  params: HttpParam[];
  responseMapping: string | null; // ruta dot-path a extraer, o null = todo
};

const TIMEOUT_MS = 8000;

function buildSchema(params: HttpParam[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of params) {
    let base: z.ZodTypeAny = p.type === "number" ? z.number() : z.string();
    if (!p.required) base = base.optional();
    shape[p.name] = base;
  }
  return z.object(shape);
}

function buildJsonSchema(params: HttpParam[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = { type: p.type };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

function pick(obj: unknown, path: string | null): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

export function makeHttpTool(cfg: HttpConnectorConfig): AgentTool {
  const schema = buildSchema(cfg.params);
  return {
    name: cfg.name,
    description: cfg.description,
    paramsSchema: schema,
    jsonSchema: buildJsonSchema(cfg.params),
    async run(rawArgs): Promise<ToolResult> {
      const parsed = schema.safeParse(rawArgs);
      if (!parsed.success) return { ok: false, error: "args inválidos" };
      const args = parsed.data as Record<string, string | number>;

      let url = cfg.urlTemplate;
      const query = new URLSearchParams();
      const body: Record<string, unknown> = {};
      for (const p of cfg.params) {
        const v = args[p.name];
        if (v === undefined) continue;
        if (p.in === "path") url = url.replace(`{${p.name}}`, String(v));
        else if (p.in === "query") query.set(p.name, String(v));
        else body[p.name] = v;
      }
      if ([...query].length) url += `?${query.toString()}`;

      const headers: Record<string, string> = { ...cfg.headers };
      if (cfg.auth.type === "bearer") headers.Authorization = `Bearer ${cfg.auth.token}`;
      if (cfg.auth.type === "apiKey") headers[cfg.auth.header] = cfg.auth.value;
      if (cfg.method === "POST") headers["Content-Type"] = "application/json";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: cfg.method,
          headers,
          body: cfg.method === "POST" ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const json = await res.json();
        return { ok: true, data: pick(json, cfg.responseMapping) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "error de red" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/tools/http-connector.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/http-connector.ts src/lib/agent/tools/http-connector.test.ts
git commit -m "feat(agent): fábrica de tool desde conector HTTP configurable"
```

---

### Task 9: Registry de tools (resuelto por org)

**Files:**
- Create: `src/lib/agent/tools/registry.ts`
- Test: `src/lib/agent/tools/registry.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb } from "@/lib/db/test-db";
import { agentTools, organization } from "@/lib/db/schema";
import { resolveTools } from "./registry";

describe("tool registry", () => {
  it("incluye built-ins habilitadas + conectores http de la org", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(agentTools).values({
      id: randomUUID(),
      orgId: "o1",
      type: "builtin",
      key: "calcular_total",
      enabled: true,
      configJson: "{}",
      createdAt: new Date(),
    });
    await db.insert(agentTools).values({
      id: randomUUID(),
      orgId: "o1",
      type: "http",
      key: "buscar_producto",
      enabled: true,
      configJson: JSON.stringify({
        name: "buscar_producto",
        description: "Busca producto",
        method: "GET",
        urlTemplate: "https://x/api",
        headers: {},
        auth: { type: "none" },
        params: [{ name: "q", type: "string", required: true, in: "query" }],
        responseMapping: null,
      }),
      createdAt: new Date(),
    });

    const tools = await resolveTools(db, "o1");
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain("calcular_total");
    expect(names).toContain("buscar_producto");
  });

  it("ignora tools deshabilitadas o builtin desconocida", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(agentTools).values({
      id: randomUUID(),
      orgId: "o2",
      type: "builtin",
      key: "no_existe",
      enabled: true,
      configJson: "{}",
      createdAt: new Date(),
    });
    expect(await resolveTools(db, "o2")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/tools/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentTools } from "@/lib/db/schema";
import { calcularTotal } from "./builtin/calcular-total";
import { escalarHumano } from "./builtin/escalar-humano";
import { recopilarDatos } from "./builtin/recopilar-datos";
import { type HttpConnectorConfig, makeHttpTool } from "./http-connector";
import type { AgentTool } from "./types";

export const BUILTIN_TOOLS: Record<string, AgentTool> = {
  calcular_total: calcularTotal,
  escalar_a_humano: escalarHumano,
  recopilar_datos: recopilarDatos,
};

export async function resolveTools(db: DB, orgId: string): Promise<AgentTool[]> {
  const rows = await db
    .select()
    .from(agentTools)
    .where(and(eq(agentTools.orgId, orgId), eq(agentTools.enabled, true)));

  const tools: AgentTool[] = [];
  for (const row of rows) {
    if (row.type === "builtin") {
      const t = BUILTIN_TOOLS[row.key];
      if (t) tools.push(t);
    } else if (row.type === "http") {
      try {
        const cfg = JSON.parse(row.configJson) as HttpConnectorConfig;
        tools.push(makeHttpTool(cfg));
      } catch {
        // conector mal configurado: lo omite
      }
    }
  }
  return tools;
}
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/tools/registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/registry.ts src/lib/agent/tools/registry.test.ts
git commit -m "feat(agent): registry de tools por org (built-in + http)"
```

---

### Task 10: Guardrails (costo mensual)

**Files:**
- Create: `src/lib/agent/guardrails.ts`
- Test: `src/lib/agent/guardrails.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb } from "@/lib/db/test-db";
import { agentRuns, organization } from "@/lib/db/schema";
import { monthlyCostCop, isOverCostCap } from "./guardrails";

async function seedRun(db: ReturnType<typeof makeTestDb>["db"], cost: number) {
  await db.insert(agentRuns).values({
    id: randomUUID(),
    orgId: "o1",
    conversationId: null,
    stepsJson: "[]",
    promptTokens: 0,
    completionTokens: 0,
    costCop: cost,
    status: "ok",
    createdAt: new Date(),
  });
}

describe("guardrails", () => {
  it("suma el costo del mes y detecta tope superado", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await seedRun(db, 300);
    await seedRun(db, 250);
    expect(await monthlyCostCop(db, "o1")).toBe(550);
    expect(await isOverCostCap(db, "o1", 500)).toBe(true);
    expect(await isOverCostCap(db, "o1", 1000)).toBe(false);
    expect(await isOverCostCap(db, "o1", null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/guardrails.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";

export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function monthlyCostCop(
  db: DB,
  orgId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${agentRuns.costCop}), 0)` })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.orgId, orgId),
        gte(agentRuns.createdAt, startOfMonth(now)),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function isOverCostCap(
  db: DB,
  orgId: string,
  capCop: number | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (capCop == null) return false;
  return (await monthlyCostCop(db, orgId, now)) >= capCop;
}
```

Nota: `startOfMonth` usa `new Date()` por defecto; en el test se pasa explícito para determinismo.

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/guardrails.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/guardrails.ts src/lib/agent/guardrails.test.ts
git commit -m "feat(agent): guardrails de costo mensual por org"
```

---

### Task 11: Fake provider (helper de test)

**Files:**
- Create: `src/lib/agent/testing/fake-provider.ts`

- [ ] **Step 1: Implementar el provider scripteado (lo usa Task 12)**

```ts
import type {
  LlmProvider,
  LlmResponse,
} from "@/lib/agent/providers/types";

/**
 * Provider de test: devuelve una secuencia predefinida de respuestas, una por
 * llamada a chat(). Permite scriptear tool_calls y la respuesta final sin API real.
 */
export function makeFakeProvider(script: LlmResponse[]): LlmProvider {
  let i = 0;
  return {
    async chat() {
      const res = script[i] ?? {
        text: "",
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0 },
      };
      i += 1;
      return res;
    },
  };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/testing/fake-provider.ts
git commit -m "test(agent): fake LlmProvider scripteado"
```

---

### Task 12: Runtime — el loop agéntico (la pieza central)

**Files:**
- Create: `src/lib/agent/runtime.ts`
- Test: `src/lib/agent/runtime.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { makeFakeProvider } from "./testing/fake-provider";
import { calcularTotal } from "./tools/builtin/calcular-total";
import { escalarHumano } from "./tools/builtin/escalar-humano";
import { runAgentLoop } from "./runtime";

const ctx = { db: {} as never, orgId: "o1", conversationId: "c1" };

describe("runAgentLoop", () => {
  it("encadena tool_call → resultado → respuesta final (determinístico)", async () => {
    const provider = makeFakeProvider([
      {
        text: null,
        toolCalls: [
          {
            id: "t1",
            name: "calcular_total",
            argsJson: JSON.stringify({
              items: [{ nombre: "Cerveza", cantidad: 2, precioUnitario: 2500 }],
            }),
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5 },
      },
      {
        text: "Son $5.000 en total.",
        toolCalls: [],
        usage: { promptTokens: 8, completionTokens: 4 },
      },
    ]);

    const res = await runAgentLoop({
      provider,
      model: "x",
      temperature: 0,
      system: "eres un asistente",
      history: [{ role: "user", content: "2 cervezas a 2500" }],
      tools: [calcularTotal],
      maxSteps: 5,
      ctx,
    });

    expect(res.status).toBe("ok");
    expect(res.reply).toBe("Son $5.000 en total.");
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0]).toMatchObject({
      tool: "calcular_total",
      result: { ok: true, data: { total: 5000 } },
    });
    expect(res.usage).toEqual({ promptTokens: 18, completionTokens: 9 });
  });

  it("escalar_a_humano corta el loop con status escalated", async () => {
    const provider = makeFakeProvider([
      {
        text: null,
        toolCalls: [
          { id: "t1", name: "escalar_a_humano", argsJson: JSON.stringify({ motivo: "pide humano" }) },
        ],
        usage: { promptTokens: 5, completionTokens: 2 },
      },
    ]);
    const res = await runAgentLoop({
      provider, model: "x", temperature: 0, system: "s",
      history: [{ role: "user", content: "quiero hablar con alguien" }],
      tools: [escalarHumano], maxSteps: 5, ctx,
    });
    expect(res.status).toBe("escalated");
    expect(res.reply).toBeNull();
  });

  it("args inválidos no rompen: devuelve error a la tool y reintenta", async () => {
    const provider = makeFakeProvider([
      {
        text: null,
        toolCalls: [{ id: "t1", name: "calcular_total", argsJson: JSON.stringify({ items: [] }) }],
        usage: { promptTokens: 1, completionTokens: 1 },
      },
      { text: "Necesito al menos un item.", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } },
    ]);
    const res = await runAgentLoop({
      provider, model: "x", temperature: 0, system: "s",
      history: [{ role: "user", content: "suma" }],
      tools: [calcularTotal], maxSteps: 5, ctx,
    });
    expect(res.status).toBe("ok");
    expect(res.reply).toBe("Necesito al menos un item.");
  });

  it("tope de pasos sin respuesta → capped", async () => {
    const toolCall = {
      text: null,
      toolCalls: [{ id: "t1", name: "calcular_total", argsJson: JSON.stringify({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 1 }] }) }],
      usage: { promptTokens: 1, completionTokens: 1 },
    };
    const provider = makeFakeProvider([toolCall, toolCall, toolCall]);
    const res = await runAgentLoop({
      provider, model: "x", temperature: 0, system: "s",
      history: [{ role: "user", content: "loop" }],
      tools: [calcularTotal], maxSteps: 2, ctx,
    });
    expect(res.status).toBe("capped");
    expect(res.reply).toBeNull();
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/runtime.test.ts`
Expected: FAIL ("Cannot find module './runtime'").

- [ ] **Step 3: Implementar `runtime.ts`**

```ts
import type { LlmMessage, LlmProvider } from "./providers/types";
import type { AgentTool, ToolContext } from "./tools/types";

export type AgentStep = {
  tool: string;
  args: unknown;
  result: unknown;
};

export type AgentTurnResult = {
  reply: string | null;
  status: "ok" | "capped" | "escalated" | "error";
  steps: AgentStep[];
  usage: { promptTokens: number; completionTokens: number };
};

export async function runAgentLoop(input: {
  provider: LlmProvider;
  model: string;
  temperature: number;
  system: string;
  history: LlmMessage[];
  tools: AgentTool[];
  maxSteps: number;
  ctx: ToolContext;
}): Promise<AgentTurnResult> {
  const { provider, model, temperature, system, tools, maxSteps, ctx } = input;
  const messages: LlmMessage[] = [...input.history];
  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.jsonSchema,
  }));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const steps: AgentStep[] = [];
  const usage = { promptTokens: 0, completionTokens: 0 };

  for (let i = 0; i < maxSteps; i++) {
    const res = await provider.chat({
      system,
      messages,
      tools: toolSchemas,
      temperature,
      model,
    });
    usage.promptTokens += res.usage.promptTokens;
    usage.completionTokens += res.usage.completionTokens;

    if (res.toolCalls.length === 0) {
      return { reply: res.text ?? "", status: "ok", steps, usage };
    }

    messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });

    for (const call of res.toolCalls) {
      const tool = byName.get(call.name);
      if (!tool) {
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ ok: false, error: "tool desconocida" }) });
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(call.argsJson);
      } catch {
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ ok: false, error: "args no son JSON" }) });
        continue;
      }
      const parsed = tool.paramsSchema.safeParse(raw);
      if (!parsed.success) {
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ ok: false, error: "args inválidos" }) });
        continue;
      }
      const result = await tool.run(parsed.data, ctx);
      steps.push({ tool: call.name, args: parsed.data, result });
      if (call.name === "escalar_a_humano" && result.ok) {
        return { reply: null, status: "escalated", steps, usage };
      }
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
    }
  }

  return { reply: null, status: "capped", steps, usage };
}
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/runtime.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/runtime.ts src/lib/agent/runtime.test.ts
git commit -m "feat(agent): runAgentLoop — loop agéntico determinístico (LLM↔tools)"
```

---

### Task 13: Provider OpenAI

**Files:**
- Create: `src/lib/agent/providers/openai.ts`
- Test: `src/lib/agent/providers/openai.test.ts`

- [ ] **Step 1: Escribir el test que falla (mapeo de respuesta, sin red real)**

```ts
import { describe, expect, it, vi } from "vitest";
import { makeOpenAiProvider } from "./openai";

describe("openai provider", () => {
  it("mapea tool_calls y usage de la respuesta de OpenAI", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "tc1", function: { name: "calcular_total", arguments: '{"items":[]}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 7 },
    });
    const provider = makeOpenAiProvider({
      chat: { completions: { create } },
    } as never);

    const res = await provider.chat({
      system: "s",
      messages: [{ role: "user", content: "hola" }],
      tools: [{ name: "calcular_total", description: "d", parameters: { type: "object" } }],
      temperature: 0,
      model: "gpt-5-mini",
    });

    expect(res.toolCalls).toEqual([
      { id: "tc1", name: "calcular_total", argsJson: '{"items":[]}' },
    ]);
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 7 });
    expect(res.text).toBeNull();
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/providers/openai.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type OpenAI from "openai";
import type { LlmProvider, LlmResponse } from "./types";

export function makeOpenAiProvider(client: OpenAI): LlmProvider {
  return {
    async chat(input): Promise<LlmResponse> {
      const res = await client.chat.completions.create({
        model: input.model,
        temperature: input.temperature,
        messages: [
          { role: "system", content: input.system },
          ...input.messages.map((m) => {
            if (m.role === "tool")
              return { role: "tool" as const, tool_call_id: m.toolCallId, content: m.content };
            if (m.role === "assistant")
              return {
                role: "assistant" as const,
                content: m.content,
                tool_calls: m.toolCalls?.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: c.argsJson },
                })),
              };
            return { role: "user" as const, content: m.content };
          }),
        ],
        tools: input.tools.map((t) => ({
          type: "function" as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      });
      const msg = res.choices[0]?.message;
      const toolCalls =
        msg?.tool_calls?.map((c) => ({
          id: c.id,
          name: c.function.name,
          argsJson: c.function.arguments,
        })) ?? [];
      return {
        text: msg?.content ?? null,
        toolCalls,
        usage: {
          promptTokens: res.usage?.prompt_tokens ?? 0,
          completionTokens: res.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/providers/openai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/providers/openai.ts src/lib/agent/providers/openai.test.ts
git commit -m "feat(agent): provider OpenAI (LlmProvider)"
```

---

### Task 14: Provider Anthropic

**Files:**
- Modify: `package.json` (añadir `@anthropic-ai/sdk`)
- Create: `src/lib/agent/providers/anthropic.ts`
- Test: `src/lib/agent/providers/anthropic.test.ts`

- [ ] **Step 1: Instalar el SDK**

Run: `bun add @anthropic-ai/sdk`
Expected: añade la dependencia.

- [ ] **Step 2: Escribir el test que falla**

```ts
import { describe, expect, it, vi } from "vitest";
import { makeAnthropicProvider } from "./anthropic";

describe("anthropic provider", () => {
  it("mapea tool_use y usage del response de Anthropic", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "tool_use", id: "tu1", name: "calcular_total", input: { items: [] } },
      ],
      usage: { input_tokens: 20, output_tokens: 9 },
    });
    const provider = makeAnthropicProvider({ messages: { create } } as never);

    const res = await provider.chat({
      system: "s",
      messages: [{ role: "user", content: "hola" }],
      tools: [{ name: "calcular_total", description: "d", parameters: { type: "object" } }],
      temperature: 0,
      model: "claude-haiku-4-5-20251001",
    });

    expect(res.toolCalls).toEqual([
      { id: "tu1", name: "calcular_total", argsJson: JSON.stringify({ items: [] }) },
    ]);
    expect(res.usage).toEqual({ promptTokens: 20, completionTokens: 9 });
  });
});
```

- [ ] **Step 3: Run para verificar que falla**

Run: `bun run test src/lib/agent/providers/anthropic.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmResponse } from "./types";

export function makeAnthropicProvider(client: Anthropic): LlmProvider {
  return {
    async chat(input): Promise<LlmResponse> {
      const res = await client.messages.create({
        model: input.model,
        max_tokens: 1024,
        temperature: input.temperature,
        system: input.system,
        tools: input.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
        messages: input.messages.map((m) => {
          if (m.role === "tool")
            return {
              role: "user" as const,
              content: [{ type: "tool_result" as const, tool_use_id: m.toolCallId, content: m.content }],
            };
          if (m.role === "assistant")
            return {
              role: "assistant" as const,
              content: [
                ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
                ...(m.toolCalls?.map((c) => ({
                  type: "tool_use" as const,
                  id: c.id,
                  name: c.name,
                  input: JSON.parse(c.argsJson),
                })) ?? []),
              ],
            };
          return { role: "user" as const, content: m.content };
        }),
      });

      let text: string | null = null;
      const toolCalls: LlmResponse["toolCalls"] = [];
      for (const block of res.content) {
        if (block.type === "text") text = (text ?? "") + block.text;
        if (block.type === "tool_use")
          toolCalls.push({ id: block.id, name: block.name, argsJson: JSON.stringify(block.input) });
      }
      return {
        text,
        toolCalls,
        usage: {
          promptTokens: res.usage.input_tokens,
          completionTokens: res.usage.output_tokens,
        },
      };
    },
  };
}
```

- [ ] **Step 5: Run para verificar que pasa**

Run: `bun run test src/lib/agent/providers/anthropic.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/lib/agent/providers/anthropic.ts src/lib/agent/providers/anthropic.test.ts
git commit -m "feat(agent): provider Anthropic (LlmProvider) + @anthropic-ai/sdk"
```

---

### Task 15: Selector de provider por config

**Files:**
- Modify: `src/lib/env.ts` (asegurar `ANTHROPIC_API_KEY` accesible — ya existe)
- Create: `src/lib/agent/providers/index.ts`
- Test: `src/lib/agent/providers/index.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { getProvider } from "./index";

describe("getProvider", () => {
  it("devuelve un LlmProvider con método chat según el provider", () => {
    const p = getProvider({ provider: "openai" });
    expect(typeof p.chat).toBe("function");
    const a = getProvider({ provider: "anthropic" });
    expect(typeof a.chat).toBe("function");
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/providers/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { makeAnthropicProvider } from "./anthropic";
import { makeOpenAiProvider } from "./openai";
import type { LlmProvider } from "./types";

export function getProvider(config: { provider: "openai" | "anthropic" }): LlmProvider {
  if (config.provider === "anthropic") {
    return makeAnthropicProvider(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" }));
  }
  return makeOpenAiProvider(new OpenAI({ apiKey: env.OPENAI_API_KEY ?? "" }));
}
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/providers/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/providers/index.ts src/lib/agent/providers/index.test.ts
git commit -m "feat(agent): getProvider — selección de LLM por config de org"
```

---

### Task 16: Context builder

**Files:**
- Create: `src/lib/agent/context.ts`
- Test: `src/lib/agent/context.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, toLlmHistory } from "./context";

describe("context", () => {
  it("arma el system prompt con persona + reglas", () => {
    const s = buildSystemPrompt({
      name: "Lula",
      systemPrompt: "Eres amable y vendes cerveza.",
    });
    expect(s).toContain("Lula");
    expect(s).toContain("vendes cerveza");
    // regla global: no inventar, usar tools
    expect(s.toLowerCase()).toContain("herramienta");
  });

  it("convierte mensajes del hilo a LlmMessage (in=user, out=assistant)", () => {
    const msgs = toLlmHistory([
      { direction: "in", body: "hola" },
      { direction: "out", body: "¿en qué te ayudo?" },
      { direction: "in", body: "quiero 2 cervezas" },
    ]);
    expect(msgs).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "¿en qué te ayudo?" },
      { role: "user", content: "quiero 2 cervezas" },
    ]);
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bun run test src/lib/agent/context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { LlmMessage } from "./providers/types";

const GLOBAL_RULES = `Reglas:
- Responde en español, natural y breve, como un humano por WhatsApp.
- Para cualquier cálculo, búsqueda o acción usa SIEMPRE una herramienta; nunca inventes números ni datos.
- Si no puedes resolver algo o el cliente pide una persona, usa la herramienta escalar_a_humano.`;

export function buildSystemPrompt(config: {
  name: string;
  systemPrompt: string;
}): string {
  return `Eres ${config.name}, un asistente de WhatsApp.\n\n${config.systemPrompt}\n\n${GLOBAL_RULES}`;
}

export function toLlmHistory(
  msgs: { direction: "in" | "out"; body: string | null }[],
): LlmMessage[] {
  return msgs
    .filter((m) => m.body && m.body.trim() !== "")
    .map((m) =>
      m.direction === "in"
        ? { role: "user" as const, content: m.body as string }
        : { role: "assistant" as const, content: m.body as string },
    );
}
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `bun run test src/lib/agent/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context.ts src/lib/agent/context.test.ts
git commit -m "feat(agent): context builder (system prompt + historial→LlmMessage)"
```

---

### Task 17: Gauntlet final del motor

**Files:** (ninguno nuevo)

- [ ] **Step 1: Typecheck + lint + tests + build**

Run:
```bash
bunx tsc --noEmit && bun run lint && bun run test && bun run build
```
Expected: tsc exit 0; lint sin errores; todos los tests verdes (incluye los ~20 nuevos del motor); build OK.

- [ ] **Step 2: Commit (si lint aplicó autofixes)**

```bash
git add -A && git commit -m "chore(agent): gauntlet motor verde" || echo "nada que commitear"
```

---

## Self-Review (hecho)

- **Cobertura del spec (motor):** config por org ✓ (T2), providers OpenAI+Anthropic+selector ✓ (T13-15), tools built-in `calcular_total`/`escalar_a_humano`/`recopilar_datos` ✓ (T5-7), conector HTTP ✓ (T8), registry por org ✓ (T9), loop agéntico determinístico ✓ (T12), guardrails de costo ✓ (T10), context/persona ✓ (T16), schema+migración ✓ (T1). Determinismo (split LLM/tools + zod) demostrado en T12.
- **Fuera de este plan (van en B y C):** debounce/turno, cola, hook al webhook, handoff/pausa en vivo (`pause.ts` + `conversations.agentPaused` ya creado en T1 para usarlo en B), panel `/configuracion/agente`, gating módulo "agente", vista `agent_runs`, plantillas. La columna `agentPaused` y la tabla `agentRuns` se crean aquí pero se *consumen* en B/C.
- **Consistencia de tipos:** `LlmProvider.chat` (T3) usado igual en T11/T12/T13/T14/T15. `AgentTool` (T4) usado en T5-9, T12. `ToolResult.ok` chequeado en T12. `LlmResponse.toolCalls/usage` consistente en providers y runtime.
- **Placeholders:** ninguno; todo el código está completo.

## Riesgos al ejecutar

- El SDK de OpenAI ya está; el de Anthropic se añade en T14 (`bun add`).
- `model` por defecto `gpt-5-mini`; para Anthropic usar un id válido (p.ej. `claude-haiku-4-5-20251001`) — se setea por org en el panel (Plan C).
- Las llamadas reales a LLM NO se ejercen en tests (se usa fake provider / mocks), así que el motor es testeable sin claves.

## Siguientes planes
- **Plan B — Integración:** `pause.ts`, `queue.ts`, `turn.ts` (debounce + run + envío + registro en `agent_runs`), hook en webhook entrante, handoff al responder un humano.
- **Plan C — Panel + gating:** `ModuleId` "agente" (Premium) en `plans.ts`, `/configuracion/agente` (básico/avanzado/plantillas/tools), guard + nav, vista de actividad (`agent_runs`).
