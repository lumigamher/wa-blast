# Gateway de modelos IA (BYO key por org) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un gateway de modelos por org (BYO key, cifrada) que reemplace las 3 lecturas dispersas de `process.env` y del que beban el agente, flow-ai y los embeddings/RAG.

**Architecture:** Tabla `ai_gateway` (provider+modelo de chat + key OpenAI y/o Anthropic cifradas) → módulo `src/lib/ai/gateway/` con `getGatewayConfig`/`saveGatewayConfig` y un resolver (`resolveChatProvider`/`resolveEmbeddingProvider`) que arma los clientes con la key por-org → los 3 consumidores y una UI nueva `/configuracion/ia` lo consumen.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle (bun:sqlite), Vitest (`bunx vitest run`), shadcn/ui, `@anthropic-ai/sdk`, `openai`.

**Spec:** `docs/superpowers/specs/2026-06-23-gateway-modelos-ia-design.md`

**Convenciones del repo:**
- Tests: `bunx vitest run <ruta>` (NO `bun test`). Typecheck: `bunx tsc --noEmit` (no hay script `typecheck`). Lint: `bun run lint`.
- **GOTCHA build crítico (de la feature anterior):** un client component NO debe importar de un módulo que importe `@anthropic-ai/sdk`/`openai` (los arrastra al bundle y rompe `next build`). El form de la UI (Task 7/8) solo importa datos puros (`providers/models.ts`); las server actions sí pueden tocar el gateway. **Correr `bun run build` antes de desplegar** (tsc+vitest NO detectan esto).
- **GOTCHA iCloud:** si `bunx tsc --noEmit` falla con conflictos en `.next/types/* 2.ts`, correr `find .next/types -name "* 2.ts" -delete` antes.
- Commits terminan con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Inventario de call-sites a refactorizar (verificado):**
- `getProvider(env)`: `src/lib/agent/dispatch.ts:40`, `src/lib/agent/turn.ts:40`.
- `getEmbeddingProvider()`: `src/lib/agent/turn.ts:56`, `src/lib/agent/tools/builtin/buscar-en-docs.ts:22`, `src/app/(app)/configuracion/agente/actions.ts:217`, `src/app/api/agent/documents/route.ts:55`.

---

## Task 1: Tabla `ai_gateway` + migración (aditiva)

**Files:**
- Modify: `src/lib/db/schema/domain.ts`
- Migración generada en `drizzle/`

- [ ] **Step 1: Añadir la tabla al schema**

En `src/lib/db/schema/domain.ts`, tras la definición de `agentConfigs` (alrededor de la línea 307+), añade:

```ts
export const aiGateway = sqliteTable("ai_gateway", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  chatProvider: text("chat_provider", { enum: ["openai", "anthropic"] })
    .notNull()
    .default("openai"),
  chatModel: text("chat_model").notNull().default("gpt-5-mini"),
  openaiKeyEnc: text("openai_key_enc"),
  anthropicKeyEnc: text("anthropic_key_enc"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

(No toques `agentConfigs.provider`/`model`: quedan vestigiales.)

- [ ] **Step 2: Generar la migración**

Run: `cd ~/Documents/wa-blast && bun run db:generate`
Expected: aparece un archivo nuevo `drizzle/00NN_*.sql` que contiene `CREATE TABLE \`ai_gateway\`` y NINGÚN `DROP`/`ALTER` sobre `agent_configs`. Verifícalo:
`ls -t drizzle/*.sql | head -1 | xargs grep -i "ai_gateway"`

- [ ] **Step 3: Aplicar y verificar local**

Run: `cd ~/Documents/wa-blast && bun run db:migrate && bunx tsc --noEmit`
Expected: migración aplicada, tsc limpio.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/db/schema/domain.ts drizzle/
git commit -m "feat(db): tabla ai_gateway (config de modelos IA por org)"
```

---

## Task 2: `gateway/config.ts` — leer/guardar config (keys cifradas)

**Files:**
- Create: `src/lib/ai/gateway/config.ts`
- Test: `src/lib/ai/gateway/config.test.ts`

Patrón de referencia: `src/lib/agent/integrations/catalog/config.ts` (encrypt/decrypt + onConflictDoUpdate + conservar secreto si llega vacío).

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/gateway/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { getGatewayConfig, saveGatewayConfig } from "./config";

describe("gateway config", () => {
  it("guarda y descifra ambas keys + provider/model", async () => {
    const { db } = makeTestDb();
    await saveGatewayConfig(db, "o1", {
      chatProvider: "anthropic",
      chatModel: "claude-haiku-4-5-20251001",
      openaiKey: "sk-openai",
      anthropicKey: "sk-anthropic",
    });
    const cfg = await getGatewayConfig(db, "o1");
    expect(cfg).toMatchObject({
      chatProvider: "anthropic",
      chatModel: "claude-haiku-4-5-20251001",
      openaiKey: "sk-openai",
      anthropicKey: "sk-anthropic",
    });
  });

  it("conserva la key existente si el patch la trae vacía/ausente", async () => {
    const { db } = makeTestDb();
    await saveGatewayConfig(db, "o1", { openaiKey: "sk-keep" });
    await saveGatewayConfig(db, "o1", { chatModel: "gpt-5-mini", openaiKey: "" });
    const cfg = await getGatewayConfig(db, "o1");
    expect(cfg?.openaiKey).toBe("sk-keep");
    expect(cfg?.chatModel).toBe("gpt-5-mini");
  });

  it("getGatewayConfig devuelve null si no hay fila", async () => {
    const { db } = makeTestDb();
    expect(await getGatewayConfig(db, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/ai/gateway/config.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementación**

Create `src/lib/ai/gateway/config.ts`:

```ts
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto/encrypt";
import type { DB } from "@/lib/db/client";
import { aiGateway } from "@/lib/db/schema";

export type GatewayConfig = {
  chatProvider: "openai" | "anthropic";
  chatModel: string;
  openaiKey: string | null;
  anthropicKey: string | null;
};

export type GatewayPatch = {
  chatProvider?: "openai" | "anthropic";
  chatModel?: string;
  openaiKey?: string; // "" o ausente = no cambiar
  anthropicKey?: string;
};

export async function getGatewayConfig(db: DB, orgId: string): Promise<GatewayConfig | null> {
  const row = (await db.select().from(aiGateway).where(eq(aiGateway.orgId, orgId)))[0];
  if (!row) return null;
  const dec = (v: string | null): string | null => {
    if (!v) return null;
    try { return decrypt(v); } catch { return null; }
  };
  return {
    chatProvider: row.chatProvider,
    chatModel: row.chatModel,
    openaiKey: dec(row.openaiKeyEnc),
    anthropicKey: dec(row.anthropicKeyEnc),
  };
}

export async function saveGatewayConfig(db: DB, orgId: string, patch: GatewayPatch): Promise<void> {
  const now = new Date();
  const existing = (await db.select().from(aiGateway).where(eq(aiGateway.orgId, orgId)))[0];

  const encOrKeep = (incoming: string | undefined, current: string | null | undefined): string | null => {
    if (incoming && incoming.trim()) return encrypt(incoming.trim());
    return current ?? null; // conserva la guardada
  };

  const values = {
    orgId,
    chatProvider: patch.chatProvider ?? existing?.chatProvider ?? "openai",
    chatModel: patch.chatModel ?? existing?.chatModel ?? "gpt-5-mini",
    openaiKeyEnc: encOrKeep(patch.openaiKey, existing?.openaiKeyEnc),
    anthropicKeyEnc: encOrKeep(patch.anthropicKey, existing?.anthropicKeyEnc),
    updatedAt: now,
  };

  await db
    .insert(aiGateway)
    .values(values)
    .onConflictDoUpdate({ target: aiGateway.orgId, set: { ...values, orgId: undefined } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/ai/gateway/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/ai/gateway/config.ts src/lib/ai/gateway/config.test.ts
git commit -m "feat(gateway): leer/guardar config de modelos por org (keys cifradas)"
```

---

## Task 3: `gateway/resolve.ts` — resolver provider de chat y de embeddings

**Files:**
- Create: `src/lib/ai/gateway/resolve.ts`
- Test: `src/lib/ai/gateway/resolve.test.ts`

Reutiliza `makeOpenAiProvider`/`makeAnthropicProvider` (`@/lib/agent/providers/{openai,anthropic}`) y `makeOpenAiEmbeddingProvider` (`@/lib/agent/rag/embeddings/openai`), inyectando clientes construidos con la key por-org.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/gateway/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { saveGatewayConfig } from "./config";
import { resolveChatProvider, resolveEmbeddingProvider } from "./resolve";

describe("gateway resolve", () => {
  it("resolveChatProvider arma provider OpenAI con su key", async () => {
    const { db } = makeTestDb();
    await saveGatewayConfig(db, "o1", { chatProvider: "openai", chatModel: "gpt-5-mini", openaiKey: "sk-x" });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.model).toBe("gpt-5-mini");
      expect(typeof r.provider.chat).toBe("function");
    }
  });

  it("resolveChatProvider falla legible si falta la key del proveedor elegido", async () => {
    const { db } = makeTestDb();
    await saveGatewayConfig(db, "o1", { chatProvider: "anthropic", chatModel: "claude-haiku-4-5-20251001", openaiKey: "sk-x" });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Anthropic/i);
  });

  it("resolveChatProvider falla si no hay config", async () => {
    const { db } = makeTestDb();
    const r = await resolveChatProvider(db, "nope");
    expect(r.ok).toBe(false);
  });

  it("resolveEmbeddingProvider usa la key OpenAI aunque el chat sea Anthropic", async () => {
    const { db } = makeTestDb();
    await saveGatewayConfig(db, "o1", { chatProvider: "anthropic", anthropicKey: "sk-a", openaiKey: "sk-o" });
    const emb = await resolveEmbeddingProvider(db, "o1");
    expect(emb).not.toBeNull();
    expect(emb?.model).toBe("text-embedding-3-small");
  });

  it("resolveEmbeddingProvider null sin key OpenAI", async () => {
    const { db } = makeTestDb();
    await saveGatewayConfig(db, "o1", { chatProvider: "anthropic", anthropicKey: "sk-a" });
    expect(await resolveEmbeddingProvider(db, "o1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/ai/gateway/resolve.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementación**

Create `src/lib/ai/gateway/resolve.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { DB } from "@/lib/db/client";
import { makeAnthropicProvider } from "@/lib/agent/providers/anthropic";
import { makeOpenAiProvider } from "@/lib/agent/providers/openai";
import type { LlmProvider } from "@/lib/agent/providers/types";
import { makeOpenAiEmbeddingProvider } from "@/lib/agent/rag/embeddings/openai";
import type { EmbeddingProvider } from "@/lib/agent/rag/embeddings/types";
import { getGatewayConfig } from "./config";

export type ChatResolution =
  | { ok: true; provider: LlmProvider; model: string }
  | { ok: false; error: string };

export async function resolveChatProvider(db: DB, orgId: string): Promise<ChatResolution> {
  const cfg = await getGatewayConfig(db, orgId);
  if (!cfg) {
    return { ok: false, error: "Configura tu modelo y API key en Configuración › IA." };
  }
  if (cfg.chatProvider === "anthropic") {
    if (!cfg.anthropicKey) {
      return { ok: false, error: "Falta tu API key de Anthropic. Agrégala en Configuración › IA." };
    }
    return {
      ok: true,
      provider: makeAnthropicProvider(new Anthropic({ apiKey: cfg.anthropicKey })),
      model: cfg.chatModel,
    };
  }
  if (!cfg.openaiKey) {
    return { ok: false, error: "Falta tu API key de OpenAI. Agrégala en Configuración › IA." };
  }
  return {
    ok: true,
    provider: makeOpenAiProvider(new OpenAI({ apiKey: cfg.openaiKey })),
    model: cfg.chatModel,
  };
}

// Embeddings = solo OpenAI. null si la org no tiene key OpenAI (RAG se salta).
export async function resolveEmbeddingProvider(db: DB, orgId: string): Promise<EmbeddingProvider | null> {
  const cfg = await getGatewayConfig(db, orgId);
  if (!cfg?.openaiKey) return null;
  return makeOpenAiEmbeddingProvider(new OpenAI({ apiKey: cfg.openaiKey }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/ai/gateway/resolve.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/ai/gateway/resolve.ts src/lib/ai/gateway/resolve.test.ts
git commit -m "feat(gateway): resolver de provider de chat y embeddings por org"
```

---

## Task 4: Agente (`turn.ts` + `dispatch.ts`) bebe del gateway

**Files:**
- Modify: `src/lib/agent/turn.ts`
- Modify: `src/lib/agent/dispatch.ts`
- Modify: `src/lib/agent/config.ts` (quitar provider/model de DEFAULTS)
- Test: `src/lib/agent/turn.test.ts` (añadir caso degradado)

- [ ] **Step 1: Quitar provider/model de los DEFAULTS del agente**

En `src/lib/agent/config.ts`, en el objeto `DEFAULTS`, **elimina** las líneas `provider: "openai" as const,` y `model: "gpt-5-mini",`. (Las columnas siguen en la tabla con su default; solo dejamos de fijarlas desde código.) `getAgentConfig` sigue devolviendo la fila tal cual (incluye las columnas vestigiales — no rompe nada).

- [ ] **Step 2: Write the failing test (turno degradado sin key)**

En `src/lib/agent/turn.test.ts`, añade un caso. Primero revisa cómo el archivo construye `db`/orgId/config y mockea el envío (sigue ese patrón). El caso nuevo:

```ts
it("sin gateway configurado: envía fallback y no llama al LLM", async () => {
  // org con agente habilitado pero SIN ai_gateway (resolveChatProvider → {ok:false})
  // (usa el mismo helper de setup del archivo: org, agent_configs.enabled=true, una conversación con un mensaje entrante)
  const sent: string[] = [];
  await runAgentTurn(db, orgId, conversationId, {
    sender: async ({ body }) => { sent.push(body); return { wamid: "x" }; },
    to: "57300",
  });
  expect(sent[0]).toBe("En un momento te atiende una persona del equipo."); // fallbackMessage default
});
```

(No inyectes `deps.provider` en este caso — así fuerzas la ruta del resolver.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/agent/turn.test.ts`
Expected: FAIL (hoy `getProvider(env)` lanza o usa env; el fallback no se envía).

- [ ] **Step 4: Implementación en `turn.ts`**

4a. Reemplaza el import (línea 11) `import { getProvider } from "./providers";` por:
```ts
import { resolveChatProvider } from "@/lib/ai/gateway/resolve";
```

4b. Reemplaza la resolución del provider (línea ~40) `const provider = deps.provider ?? getProvider({ provider: config.provider });` por:
```ts
  let chatProvider = deps.provider;
  let chatModel = "gpt-5-mini";
  if (chatProvider) {
    // tests inyectan un provider fake; el modelo es indiferente
  } else {
    const resolved = await resolveChatProvider(db, orgId);
    if (!resolved.ok) {
      // Sin credenciales: degradar con gracia — enviar fallback y salir.
      if (config.fallbackMessage) {
        await (deps.sender ?? defaultSender)({ to: deps.to ?? "", body: config.fallbackMessage });
      }
      return;
    }
    chatProvider = resolved.provider;
    chatModel = resolved.model;
  }
```
> NOTA: revisa cómo `turn.ts` envía mensajes (el `sender`). Usa el MISMO mecanismo que ya usa al final del turno para enviar el `reply` (probablemente `deps.sender`). Sustituye `(deps.sender ?? defaultSender)(...)` por la forma real de envío del archivo. El objetivo: enviar `config.fallbackMessage` por el mismo canal y `return` sin llamar al LLM.

4c. En la llamada a `runAgentLoop` (línea ~73-82), cambia `provider,` por `provider: chatProvider,` y `model: config.model,` por `model: chatModel,`.

4d. En `estimateCostCop` (línea ~84) cambia `estimateCostCop(res.usage, config.provider, config.model)` por:
```ts
    const costCop = estimateCostCop(res.usage, deps.provider ? "openai" : (chatProvider === undefined ? "openai" : chatProviderKind), chatModel);
```
> SIMPLIFICACIÓN: en vez de derivar el kind, captura el proveedor elegido en una variable `let chatProviderKind: "openai" | "anthropic" = "openai";` en el bloque 4b (asígnale el `cfg.chatProvider` correspondiente — para eso, devuelve también el kind: añade `kind` a `ChatResolution.ok` en Task 3 **o** vuelve a leer `getGatewayConfig` aquí). Para no tocar Task 3, lo más limpio: en 4b, cuando `resolved.ok`, setea `chatProviderKind = (await getGatewayConfig(db, orgId))!.chatProvider`. Como `estimateCostCop` solo usa el kind para tarifas, si `deps.provider` (tests) usa `"openai"`.

- [ ] **Step 5: Implementación en `dispatch.ts`**

5a. Elimina el import `import { getProvider } from "./providers";` (línea 8).
5b. En `runRealTurn` (línea ~40), quita `provider: getProvider({ provider: config.provider }),` de las deps. `config` ya no se usa para el provider; si `config` queda sin uso, elimínalo (pero `getAgentConfig` puede seguir necesitándose para otra cosa — si no, bórralo). La llamada queda:
```ts
  await runAgentTurn(defaultDb, orgId, conversationId, { sender, to: phone });
```

- [ ] **Step 6: Run tests + typecheck**

Run:
```bash
cd ~/Documents/wa-blast
bunx vitest run src/lib/agent/turn.test.ts src/lib/agent/dispatch.test.ts
bunx tsc --noEmit
```
Expected: verde. Si `config.provider`/`config.model` rompen tsc en otros lados, búscalos (`grep -rn "config.provider\|config.model" src/lib/agent`) y migra cada uso a `chatProviderKind`/`chatModel`.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/agent/turn.ts src/lib/agent/dispatch.ts src/lib/agent/config.ts src/lib/agent/turn.test.ts
git commit -m "feat(agent): provider/modelo desde el gateway; degradar sin key"
```

---

## Task 5: flow-ai bebe del gateway

**Files:**
- Modify: `src/lib/flow-ai.ts`
- Modify: `src/app/(app)/flows/nueva/actions.ts`
- Test: `src/lib/flow-ai.test.ts` (si existe; si no, créalo)

Decisión (riesgo del spec resuelto): flow-ai usa la abstracción `LlmProvider.chat` con `tools: []`. Ya tiene `extractFlowJson` + reintento robusto, así que no necesita `response_format` ni la key cruda, y funciona con OpenAI **o** Anthropic.

- [ ] **Step 1: Write the failing test**

Create/extend `src/lib/flow-ai.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { generateFlowJson } from "./flow-ai";

describe("generateFlowJson", () => {
  it("usa el provider del gateway y extrae el JSON", async () => {
    const fakeProvider = {
      chat: vi.fn().mockResolvedValue({
        text: '{"version":"6.3","screens":[]}',
        toolCalls: [],
        usage: { promptTokens: 1, completionTokens: 1 },
      }),
    };
    const out = await generateFlowJson("captura nombre y teléfono", {
      provider: fakeProvider as never,
      model: "gpt-5-mini",
    });
    expect(JSON.parse(out).version).toBe("6.3");
    expect(fakeProvider.chat).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/flow-ai.test.ts`
Expected: FAIL — `generateFlowJson` no acepta deps / sigue usando OpenAI directo.

- [ ] **Step 3: Implementación en `flow-ai.ts`**

Reemplaza la firma y el cuerpo de `generateFlowJson` (conserva `extractFlowJson` y `SYSTEM` tal cual). Quita el import de `OpenAI` y de `env`:

```ts
import type { LlmProvider } from "@/lib/agent/providers/types";

// ... extractFlowJson y SYSTEM SIN cambios ...

export async function generateFlowJson(
  request: string,
  deps: { provider: LlmProvider; model: string },
): Promise<string> {
  const { provider, model } = deps;
  async function ask(extra?: string): Promise<string> {
    const res = await provider.chat({
      system: SYSTEM,
      messages: [{ role: "user", content: `Genera el Flow JSON para: ${request}${extra ? `\n\n${extra}` : ""}` }],
      tools: [],
      temperature: 0.2,
      model,
    });
    return res.text ?? "";
  }
  const first = await ask();
  try {
    return JSON.stringify(JSON.parse(extractFlowJson(first)), null, 2);
  } catch {
    const second = await ask("Tu salida anterior no era JSON válido. Devuelve SOLO el JSON del Flow, sin texto.");
    return JSON.stringify(JSON.parse(extractFlowJson(second)), null, 2);
  }
}
```

- [ ] **Step 4: Implementación en el server action**

En `src/app/(app)/flows/nueva/actions.ts`, donde se llama `generateFlowJson(request)`, resuelve el provider del gateway con el orgId de sesión:

```ts
import { db } from "@/lib/db/client";
import { resolveChatProvider } from "@/lib/ai/gateway/resolve";
// dentro del action, tras obtener { orgId } = await requireOrg():
  const resolved = await resolveChatProvider(db, orgId);
  if (!resolved.ok) return { error: resolved.error };
  const json = await generateFlowJson(request, { provider: resolved.provider, model: resolved.model });
```
> Ajusta al shape de retorno real del action (si hoy devuelve `{ json }` o similar, mantén ese contrato y solo añade la rama de error `{ error }`). Revisa el archivo para encajar.

- [ ] **Step 5: Run tests + typecheck**

Run:
```bash
cd ~/Documents/wa-blast
bunx vitest run src/lib/flow-ai.test.ts
bunx tsc --noEmit
```
Expected: verde.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/flow-ai.ts "src/app/(app)/flows/nueva/actions.ts" src/lib/flow-ai.test.ts
git commit -m "feat(flow-ai): generar Flow JSON con el provider del gateway por org"
```

---

## Task 6: Embeddings/RAG beben del gateway

**Files:**
- Modify: `src/lib/agent/turn.ts` (línea ~56)
- Modify: `src/lib/agent/tools/builtin/buscar-en-docs.ts` (línea ~22)
- Modify: `src/app/(app)/configuracion/agente/actions.ts` (línea ~217)
- Modify: `src/app/api/agent/documents/route.ts` (línea ~55)
- Test: `src/lib/agent/tools/builtin/buscar-en-docs.test.ts` (si aplica)

- [ ] **Step 1: `turn.ts` (auto-RAG)**

Cambia el import (línea 15) `import { getEmbeddingProvider } from "./rag/embeddings";` por:
```ts
import { resolveEmbeddingProvider } from "@/lib/ai/gateway/resolve";
```
Y el bloque (línea ~54-62):
```ts
    try {
      const embeddings = deps.embeddings ?? (await resolveEmbeddingProvider(db, orgId));
      if (embeddings) {
        knowledge = await retrieveKnowledge(db, orgId, lastIncoming, { embeddings });
      }
    } catch {
      knowledge = "";
    }
```

- [ ] **Step 2: `buscar-en-docs.ts` (tool)**

Cambia el import (línea 2) a `import { resolveEmbeddingProvider } from "@/lib/ai/gateway/resolve";` y el cuerpo (línea ~22-23):
```ts
      const embeddings = await resolveEmbeddingProvider(ctx.db, ctx.orgId);
      if (!embeddings) return { ok: false, error: "RAG no disponible: configura tu API key de OpenAI en Configuración › IA." };
      const info = await retrieveKnowledge(ctx.db, ctx.orgId, query, { embeddings });
```

- [ ] **Step 3: `configuracion/agente/actions.ts` (ingesta de documentos)**

Cambia el import (línea 14) a `resolveEmbeddingProvider` y donde hoy hace `{ embeddings: getEmbeddingProvider() }` (línea ~217):
```ts
  const embeddings = await resolveEmbeddingProvider(db, orgId);
  if (!embeddings) return { error: "Configura tu API key de OpenAI en Configuración › IA para indexar documentos." };
  // ...usa { embeddings } en la llamada a ingest
```
> Ajusta al contrato de retorno del action (añade rama `{ error }` si no existe).

- [ ] **Step 4: `api/agent/documents/route.ts`**

Cambia el import (línea 7) a `resolveEmbeddingProvider` y donde usa `{ embeddings: getEmbeddingProvider() }` (línea ~55):
```ts
  const embeddings = await resolveEmbeddingProvider(db, orgId);
  if (!embeddings) {
    return Response.json({ error: "Configura tu API key de OpenAI en Configuración › IA." }, { status: 400 });
  }
  // ...usa { embeddings } en ingest
```
> Usa el `db`/`orgId` que el route ya tiene (revisa cómo obtiene orgId — probablemente de la sesión/requireOrg).

- [ ] **Step 5: Run tests + typecheck**

Run:
```bash
cd ~/Documents/wa-blast
bunx vitest run src/lib/agent/ && bunx tsc --noEmit
```
Expected: verde. Confirma que NO quedan referencias: `grep -rn "getEmbeddingProvider" src --include="*.ts" --include="*.tsx" | grep -v "rag/embeddings/index.ts"` debe estar vacío salvo la definición.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/agent/turn.ts src/lib/agent/tools/builtin/buscar-en-docs.ts "src/app/(app)/configuracion/agente/actions.ts" src/app/api/agent/documents/route.ts
git commit -m "feat(rag): embeddings desde la key OpenAI del gateway por org"
```

---

## Task 7: UI `/configuracion/ia` + actions

**Files:**
- Create: `src/app/(app)/configuracion/ia/page.tsx`
- Create: `src/app/(app)/configuracion/ia/_gateway-form.tsx`
- Create: `src/app/(app)/configuracion/ia/actions.ts`
- Modify: `src/app/(app)/layout.tsx` (link en sidebar, sección "Cuenta")

- [ ] **Step 1: Server actions**

Create `src/app/(app)/configuracion/ia/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { saveGatewayConfig, type GatewayPatch } from "@/lib/ai/gateway/config";
import { resolveChatProvider, resolveEmbeddingProvider } from "@/lib/ai/gateway/resolve";

export async function saveGatewayAction(patch: GatewayPatch): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await saveGatewayConfig(db, orgId, patch);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al guardar" };
  }
  revalidatePath("/configuracion/ia");
  return { ok: true };
}

export async function testGatewayAction(
  which: "chat" | "openai-embeddings",
): Promise<{ ok: true; detail: string } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    if (which === "chat") {
      const r = await resolveChatProvider(db, orgId);
      if (!r.ok) return { error: r.error };
      const res = await r.provider.chat({
        system: "Responde solo 'ok'.",
        messages: [{ role: "user", content: "ok" }],
        tools: [],
        temperature: 0,
        model: r.model,
      });
      return { ok: true, detail: `Modelo ${r.model} respondió (${res.usage.completionTokens} tokens).` };
    }
    const emb = await resolveEmbeddingProvider(db, orgId);
    if (!emb) return { error: "Falta tu API key de OpenAI." };
    const vecs = await emb.embed(["ping"]);
    return { ok: true, detail: `Embeddings OK (dim ${vecs[0]?.length ?? 0}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "La prueba falló (¿key inválida?)." };
  }
}
```

- [ ] **Step 2: Página (server component)**

Create `src/app/(app)/configuracion/ia/page.tsx`:

```tsx
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getGatewayConfig } from "@/lib/ai/gateway/config";
import { GatewayForm } from "./_gateway-form";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { orgId } = await requireOrg();
  const cfg = await getGatewayConfig(db, orgId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">IA / Modelos</h1>
        <p className="text-sm text-muted-foreground">
          Configura el proveedor, el modelo y tus API keys. Alimenta el agente, los Flows con IA y la base de conocimiento.
        </p>
      </div>
      <GatewayForm
        chatProvider={cfg?.chatProvider ?? "openai"}
        chatModel={cfg?.chatModel ?? "gpt-5-mini"}
        hasOpenaiKey={!!cfg?.openaiKey}
        hasAnthropicKey={!!cfg?.anthropicKey}
      />
    </div>
  );
}
```

- [ ] **Step 3: Form (client component)**

Create `src/app/(app)/configuracion/ia/_gateway-form.tsx`. **IMPORTA SOLO `CURATED_MODELS` desde `@/lib/agent/providers/models`** (datos puros, sin SDK — respeta el gotcha del bundle). Reusa el patrón del selector curado + "Personalizado…" del agente:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURATED_MODELS } from "@/lib/agent/providers/models";
import { saveGatewayAction, testGatewayAction } from "./actions";

export function GatewayForm(props: {
  chatProvider: "openai" | "anthropic";
  chatModel: string;
  hasOpenaiKey: boolean;
  hasAnthropicKey: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<"openai" | "anthropic">(props.chatProvider);
  const [model, setModel] = useState(props.chatModel);
  const [custom, setCustom] = useState(!CURATED_MODELS[props.chatProvider].some((m) => m.id === props.chatModel));
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveGatewayAction({ chatProvider: provider, chatModel: model, openaiKey, anthropicKey });
      if ("error" in r) return toast.error(r.error);
      toast.success("Configuración de IA guardada");
      setOpenaiKey(""); setAnthropicKey("");
      router.refresh();
    });
  };

  const test = (which: "chat" | "openai-embeddings") => {
    startTransition(async () => {
      const r = await testGatewayAction(which);
      if ("error" in r) return toast.error(r.error);
      toast.success(r.detail);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proveedor y modelo</CardTitle>
        <CardDescription className="text-xs">Tus llaves se guardan cifradas. Déjalas vacías para no cambiarlas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="provider">Proveedor de chat</Label>
            <Select value={provider} onValueChange={(v) => {
              if (v === "openai" || v === "anthropic") {
                setProvider(v);
                const list = CURATED_MODELS[v];
                if (!custom && !list.some((m) => m.id === model)) setModel(list[0].id);
              }
            }}>
              <SelectTrigger id="provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Modelo</Label>
            <Select value={custom ? "__custom__" : model} onValueChange={(v) => {
              if (v === "__custom__") setCustom(true);
              else { setCustom(false); setModel(v); }
            }}>
              <SelectTrigger id="model"><SelectValue placeholder="Selecciona un modelo..." /></SelectTrigger>
              <SelectContent>
                {CURATED_MODELS[provider].map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label} · {m.cost} — {m.hint}</SelectItem>
                ))}
                <SelectItem value="__custom__">Personalizado…</SelectItem>
              </SelectContent>
            </Select>
            {custom && (
              <Input className="mt-2" value={model} onChange={(e) => setModel(e.target.value)}
                placeholder={provider === "openai" ? "gpt-5-mini" : "claude-haiku-4-5-20251001"} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="openai-key">API key de OpenAI</Label>
            <Input id="openai-key" type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder={props.hasOpenaiKey ? "•••• (déjalo vacío para no cambiarla)" : "sk-..."} />
            <p className="text-xs text-muted-foreground">Necesaria para la base de conocimiento (RAG), aunque el chat sea Anthropic.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anthropic-key">API key de Anthropic</Label>
            <Input id="anthropic-key" type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder={props.hasAnthropicKey ? "•••• (déjalo vacío para no cambiarla)" : "sk-ant-..."} />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => test("chat")}>Probar chat</Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => test("openai-embeddings")}>Probar embeddings</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Link en el sidebar**

En `src/app/(app)/layout.tsx`, en `NAV_SECTIONS`, sección `label: "Cuenta"` (≈línea 80-84), añade como primer item (importa un icono ya disponible, p.ej. `SparklesIcon` de lucide; si no está importado, añádelo al import de iconos):
```tsx
      { href: "/configuracion/ia", icon: SparklesIcon, label: "IA / Modelos" },
```

- [ ] **Step 5: Verificar typecheck + build**

Run:
```bash
cd ~/Documents/wa-blast
bunx tsc --noEmit
bun run build
```
Expected: ambos limpios. **El build DEBE pasar** (valida que `_gateway-form.tsx` no arrastró SDK al cliente — solo importa `providers/models`).

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/wa-blast
git add "src/app/(app)/configuracion/ia/" "src/app/(app)/layout.tsx"
git commit -m "feat(ui): seccion Configuracion > IA (gateway de modelos + probar conexion)"
```

---

## Task 8: Sacar el selector de modelo del form del agente

**Files:**
- Modify: `src/app/(app)/configuracion/agente/_form.tsx`
- Modify: `src/app/(app)/configuracion/agente/actions.ts` (y `updateAgentConfig` si tipa provider/model)

- [ ] **Step 1: Quitar el bloque Proveedor + Modelo del form**

En `_form.tsx`:
- Elimina el import `import { CURATED_MODELS } from "@/lib/agent/providers/models";`.
- Elimina el estado `initialModelIsCurated` y `customModel`.
- Elimina del objeto `values` las claves `provider` y `model`.
- Elimina los bloques JSX `{/* Provider */}` y `{/* Model */}` completos (dentro de la sección Avanzado).
- En `handleSubmit`/`saveAgentConfigAction({...})`, quita `provider: ...,` y `model: ...,`.
- Añade un aviso pequeño en su lugar:
```tsx
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  El proveedor y el modelo de IA se configuran en{" "}
                  <a href="/configuracion/ia" className="underline">Configuración › IA</a>.
                </p>
```

- [ ] **Step 2: Ajustar el contrato del action si hace falta**

`saveAgentConfigAction` usa `Parameters<typeof updateAgentConfig>[2]`. Si `updateAgentConfig`/`saveAgentConfig` aceptan un patch parcial (`Partial<...insert>`), quitar provider/model del form NO rompe tipos (siguen siendo opcionales). Verifica con tsc; si algún tipo exige `provider`/`model`, hazlos opcionales o quítalos del tipo del form.

- [ ] **Step 3: Verificar tests + typecheck + build**

Run:
```bash
cd ~/Documents/wa-blast
bunx vitest run && bunx tsc --noEmit && bun run build
```
Expected: 540+ tests verde, tsc limpio, build OK.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/wa-blast
git add "src/app/(app)/configuracion/agente/_form.tsx" "src/app/(app)/configuracion/agente/actions.ts"
git commit -m "refactor(agent-ui): el modelo se configura en el gateway, no en el agente"
```

---

## Task 9: Eliminar código muerto + verificación final

**Files:**
- Modify: `src/lib/agent/providers/index.ts` (eliminar `getProvider` env)
- Modify: `src/lib/agent/rag/embeddings/index.ts` (eliminar `getEmbeddingProvider()` sin args)

- [ ] **Step 1: Confirmar que no quedan callers**

Run:
```bash
cd ~/Documents/wa-blast
grep -rn "getProvider(" src --include="*.ts" --include="*.tsx" | grep -vE "providers/index\.ts|\.test\."
grep -rn "getEmbeddingProvider(" src --include="*.ts" --include="*.tsx" | grep -vE "rag/embeddings/index\.ts|\.test\."
```
Expected: ambos vacíos. Si hay restos, migrarlos al resolver antes de borrar.

- [ ] **Step 2: Eliminar las funciones env-based**

- En `src/lib/agent/providers/index.ts`: elimina `getEnv()` y `getProvider()` (y los imports `Anthropic`/`OpenAI` si quedan sin uso). Conserva el re-export de `CURATED_MODELS`/`CuratedModel` y `makeOpenAiProvider`/`makeAnthropicProvider` si se re-exportan; el resolver importa las fábricas directo de sus archivos, así que `index.ts` puede quedar mínimo.
- En `src/lib/agent/rag/embeddings/index.ts`: elimina `getEmbeddingProvider()` (la fábrica `makeOpenAiEmbeddingProvider` se queda; el resolver la usa). Mantén el re-export de tipos.
- Ajusta/elimina sus tests env-based (`providers/index.test.ts` el bloque de `getProvider`; el de `CURATED_MODELS` se queda).

- [ ] **Step 3: Verificación final completa**

Run:
```bash
cd ~/Documents/wa-blast
bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build
```
Expected: lint 0 errores, tsc limpio, todos los tests verde, build OK.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/agent/providers/ src/lib/agent/rag/embeddings/
git commit -m "chore(ai): eliminar getProvider/getEmbeddingProvider basados en env"
```

---

## Task 10: Verificación en vivo (requiere una API key real)

**Files:** ninguno.

- [ ] **Step 1:** Desplegar a prod (`bash deploy/deploy.sh`) tras merge — `db:migrate` crea `ai_gateway`. Health login 200.
- [ ] **Step 2:** En una org de prueba: Configuración › IA → proveedor OpenAI + modelo gpt-5-mini + pegar API key real → **Probar chat** ✅ y **Probar embeddings** ✅.
- [ ] **Step 3:** Configurar catálogo = Medusa El Man (de la feature anterior) y correr un turno del agente ("¿tienen teclados mecánicos?") → responde con productos reales.
- [ ] **Step 4:** En Flows › Nuevo, generar un Flow con IA → produce JSON. Subir un documento en Base de conocimiento → indexa sin error.

---

## Self-Review (cobertura del spec)

- **Comp.1 modelo de datos:** Task 1 (`ai_gateway` aditiva; provider/model vestigiales). ✓
- **Comp.2 gateway/config:** Task 2. ✓
- **Comp.2 gateway/resolve (chat + embeddings, lock OpenAI):** Task 3. ✓
- **Comp.3 consumidores:** agente Task 4, flow-ai Task 5, embeddings Task 6; degradación sin key en cada uno. ✓
- **Comp.4 UI /configuracion/ia + probar conexión + sidebar:** Task 7. ✓
- **Comp.5 relocalización del selector del agente:** Task 8. ✓
- **Comp.6 tests:** en cada task (config, resolve, turno degradado, flow-ai, UI actions). ✓
- **Limpieza de código env + verificación final:** Task 9; vivo en Task 10. ✓
- **Consistencia de tipos:** `GatewayConfig`/`GatewayPatch` (Task 2) consumidos por `resolve.ts` (Task 3) y actions/form (Task 7); `ChatResolution.ok` con `{provider, model}` usado en Task 4/5/7; `resolveEmbeddingProvider`→`EmbeddingProvider|null` usado en Task 6. ✓
- **Riesgo flow-ai (del spec):** resuelto en Task 5 (usa `LlmProvider.chat` + `tools:[]`, no key cruda). ✓
- **GOTCHA bundle:** Task 7/8 importan solo `providers/models`; build obligatorio en Task 7/8/9. ✓
