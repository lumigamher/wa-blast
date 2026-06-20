# Agente IA — Plan C: Panel + gating (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Dar a cada org un panel para activar y configurar su agente (persona, provider/modelo, fallback, tope de costo, tools), gateado como módulo **Premium**, con vista de actividad. Sin esto el agente nunca se enciende (`enabled=false`).

**Architecture:** Módulo "agente" en el sistema de planes (Premium). Página server `/configuracion/agente` con `requireModuleAccess("agente")`, formularios client → server actions que usan `saveAgentConfig` (Plan A) y la tabla `agentTools`. Vista de `agentRuns`.

**Tech Stack:** Next App Router (server comps + server actions), shadcn UI, lucide, Drizzle, Vitest.

**Pre-existing:** `getAgentConfig`/`saveAgentConfig` (config.ts), `agentTools`/`agentRuns`/`agentConfigs` tablas, `resolveTools`, `BUILTIN_TOOLS` (registry.ts), `requireModuleAccess` (billing), `plans.ts` (ModuleId/MODULE_LABELS/MODULE_ROUTES/PLANS).

---

## File Structure
- `src/lib/billing/plans.ts` (MOD) — `ModuleId` += "agente"; MODULE_LABELS/MODULE_ROUTES += agente; premium.modules += "agente".
- `src/app/(app)/configuracion/agente/page.tsx` — panel (server).
- `src/app/(app)/configuracion/agente/actions.ts` — server actions.
- `src/app/(app)/configuracion/agente/_form.tsx` — form básico/avanzado (client).
- `src/app/(app)/configuracion/agente/_tools.tsx` — toggles de tools built-in + JSON de conectores (client).
- `src/app/(app)/configuracion/page.tsx` (MOD) — link a "Agente IA".
- `src/app/(app)/layout.tsx` (MOD) — nav: ítem "Agente IA" en sección Cuenta, con lock por módulo.

---

### Task 1: Gating — módulo "agente" (Premium)

**Files:** Modify `src/lib/billing/plans.ts`.

- [ ] **Step 1:** En `ModuleId` añade `| "agente"`. En `PREMIUM_MODULES` añade `"agente"` (queda `[...PRO_MODULES, "llamadas", "agente"]`). En `MODULE_LABELS` añade `agente: "Agente IA"`. En `MODULE_ROUTES` añade `agente: ["/configuracion/agente"]`. (TS obliga a completar ambos Record por exhaustividad.)
- [ ] **Step 2:** Run `bun run test src/lib/billing/plans.test.ts` → debe seguir verde (los asserts no fijan la lista exacta de premium). Si algún assert cuenta módulos, ajústalo.
- [ ] **Step 3:** `bunx tsc --noEmit` clean.
- [ ] **Step 4: commit** `git add src/lib/billing/plans.ts src/lib/billing/plans.test.ts && git commit -m "feat(agent): módulo gateable 'agente' (Premium)"`

---

### Task 2: Server actions del panel

**Files:** Create `src/app/(app)/configuracion/agente/actions.ts` + test `src/lib/agent/panel-actions.test.ts` (testea la lógica pura extraída; las actions envuelven auth).

Para testear sin auth, extrae la lógica a helpers puros en un módulo nuevo `src/lib/agent/admin.ts` y que las actions solo hagan `requireOrg()` + llamen al helper.

- [ ] **Step 1: test que falla** `src/lib/agent/admin.test.ts`:
```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentTools, organization } from "@/lib/db/schema";
import { getAgentConfig } from "./config";
import { setAgentTool, updateAgentConfig } from "./admin";

async function org(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("agent admin helpers", () => {
  it("updateAgentConfig valida y guarda campos básicos", async () => {
    const { db } = makeTestDb();
    await org(db);
    await updateAgentConfig(db, "o1", { enabled: true, name: "Lula", systemPrompt: "vende", provider: "anthropic", model: "claude-haiku-4-5-20251001", temperature: 0.3, fallbackMessage: "espera", monthlyCostCapCop: 50000 });
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.enabled).toBe(true);
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.temperature).toBe(0.3);
  });

  it("updateAgentConfig acota temperatura a [0,1] y rechaza provider inválido", async () => {
    const { db } = makeTestDb();
    await org(db);
    await updateAgentConfig(db, "o1", { temperature: 5, provider: "x" as never });
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.temperature).toBeLessThanOrEqual(1);
    expect(cfg.provider).toBe("openai"); // default conservado al ser inválido
  });

  it("setAgentTool activa/crea y desactiva un built-in", async () => {
    const { db } = makeTestDb();
    await org(db);
    await setAgentTool(db, "o1", "calcular_total", true);
    let rows = await db.select().from(agentTools).where(eq(agentTools.orgId, "o1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
    await setAgentTool(db, "o1", "calcular_total", false);
    rows = await db.select().from(agentTools).where(eq(agentTools.orgId, "o1"));
    expect(rows[0].enabled).toBe(false);
  });

  it("setAgentTool rechaza built-in desconocida", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(setAgentTool(db, "o1", "no_existe", true)).rejects.toThrow();
  });
});
```
(usa `randomUUID` solo si lo necesitas; quítalo si no.)
- [ ] **Step 2: run → FAIL**
- [ ] **Step 3: implementar `src/lib/agent/admin.ts`**
```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentTools } from "@/lib/db/schema";
import { saveAgentConfig } from "./config";
import { BUILTIN_TOOLS } from "./tools/registry";

type ConfigInput = {
  enabled?: boolean;
  name?: string;
  systemPrompt?: string;
  provider?: "openai" | "anthropic";
  model?: string;
  temperature?: number;
  fallbackMessage?: string;
  monthlyCostCapCop?: number | null;
  advancedMode?: boolean;
  templateId?: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export async function updateAgentConfig(db: DB, orgId: string, input: ConfigInput): Promise<void> {
  const patch: ConfigInput = { ...input };
  if (input.provider && input.provider !== "openai" && input.provider !== "anthropic") {
    delete patch.provider;
  }
  if (typeof input.temperature === "number") patch.temperature = clamp(input.temperature, 0, 1);
  if (typeof input.name === "string") patch.name = input.name.slice(0, 80);
  await saveAgentConfig(db, orgId, patch);
}

export async function setAgentTool(db: DB, orgId: string, key: string, enabled: boolean): Promise<void> {
  if (!(key in BUILTIN_TOOLS)) throw new Error(`Tool desconocida: ${key}`);
  const existing = (
    await db.select().from(agentTools).where(and(eq(agentTools.orgId, orgId), eq(agentTools.key, key), eq(agentTools.type, "builtin")))
  )[0];
  if (existing) {
    await db.update(agentTools).set({ enabled }).where(eq(agentTools.id, existing.id));
  } else {
    await db.insert(agentTools).values({ id: randomUUID(), orgId, type: "builtin", key, enabled, configJson: "{}", createdAt: new Date() });
  }
}
```
- [ ] **Step 4: run → PASS** + tsc
- [ ] **Step 5: implementar `actions.ts`** (envuelve con auth; no se testea aquí):
```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { setAgentTool, updateAgentConfig } from "@/lib/agent/admin";
import { db } from "@/lib/db/client";

export async function saveAgentConfigAction(
  input: Parameters<typeof updateAgentConfig>[2],
): Promise<{ ok: true }> {
  const { orgId } = await requireOrg();
  await updateAgentConfig(db, orgId, input);
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function setAgentToolAction(key: string, enabled: boolean): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setAgentTool(db, orgId, key, enabled);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}
```
- [ ] **Step 6: tsc + lint** clean. **commit** `git add src/lib/agent/admin.ts src/lib/agent/admin.test.ts "src/app/(app)/configuracion/agente/actions.ts" && git commit -m "feat(agent): helpers + server actions del panel (config + tools)"`

---

### Task 3: Página + formularios del panel

**Files:** Create `page.tsx`, `_form.tsx`, `_tools.tsx` bajo `src/app/(app)/configuracion/agente/`.

**page.tsx** (server): `requireModuleAccess("agente")` → `getAgentConfig(db, orgId)`, lee `agentTools` de la org, últimos 10 `agentRuns`. Renderiza `<AgentForm config={...} />`, `<AgentTools enabled={...} />`, y una tarjeta de actividad (lista de runs: fecha, status, costo). Usa `export const dynamic = "force-dynamic"`.

**_form.tsx** (client): campos enable (switch), name, systemPrompt (textarea), provider (select openai/anthropic), model (input), temperature (slider/number 0-1), fallbackMessage (input), monthlyCostCapCop (number, opcional). Botón "Guardar" → `saveAgentConfigAction(values)` (useTransition + toast). Incluye un selector "Plantilla" (atención/ventas/reservas) que al elegir rellena el systemPrompt con un preset (constante local PRESETS).

**_tools.tsx** (client): lista las 3 tools built-in (`calcular_total`, `escalar_a_humano`, `recopilar_datos`) con su label y un switch que llama `setAgentToolAction(key, enabled)`. (El conector HTTP avanzado queda para una iteración posterior; deja un placeholder "Conectores HTTP — próximamente" o un textarea JSON opcional si hay tiempo, NO obligatorio para v1.)

- [ ] **Step 1:** crear `_form.tsx` (client) con los campos y `saveAgentConfigAction`. PRESETS:
```ts
const PRESETS: Record<string, string> = {
  atencion: "Eres un asistente de atención al cliente. Responde dudas frecuentes con amabilidad y precisión. Si no sabes algo, escala a un humano.",
  ventas: "Eres un asesor comercial. Entiende qué busca el cliente, recomienda productos, calcula totales con la herramienta y cierra la venta o agenda. Escala si piden algo fuera de tu alcance.",
  reservas: "Eres un recepcionista. Toma los datos del cliente (nombre, fecha, personas) con la herramienta de recopilar datos y confirma la reserva. Escala casos especiales.",
};
```
- [ ] **Step 2:** crear `_tools.tsx` (client) con los switches.
- [ ] **Step 3:** crear `page.tsx` (server) que ensambla todo + actividad de `agentRuns` (formatea costo COP con Intl, fecha local; sin emojis, iconos lucide).
- [ ] **Step 4:** seguir el estilo de las páginas `configuracion/*` existentes (Card, headers, switches de shadcn). `bunx tsc --noEmit` + `bun run lint` clean. `bun run build` debe compilar la ruta.
- [ ] **Step 5: commit** `git add "src/app/(app)/configuracion/agente" && git commit -m "feat(agent): panel /configuracion/agente (config + tools + actividad)"`

---

### Task 4: Nav + link en índice de configuración + guard

**Files:** Modify `src/app/(app)/layout.tsx` y `src/app/(app)/configuracion/page.tsx`.

- [ ] **Step 1:** En `configuracion/page.tsx` añade un `<ConfigLink href="/configuracion/agente" icon={<BotIcon .../>} title="Agente IA" desc="Activa y configura tu asistente automático de WhatsApp" />` (importa `BotIcon` de lucide).
- [ ] **Step 2:** En `layout.tsx`, añade a la sección "Cuenta" un ítem `{ href: "/configuracion/agente", icon: BotIcon, label: "Agente IA", module: "agente" }` (importa BotIcon). Como la nav ya calcula `isLocked` por módulo (Plan de planes), pasa el `module` para que se bloquee si el plan no lo incluye. Verifica el patrón existente de `module` en NavItem y reúsalo.
- [ ] **Step 3:** El guard ya está en `page.tsx` (`requireModuleAccess("agente")` de Task 3). Verifica que redirige a `/facturacion?upgrade=agente` sin el módulo.
- [ ] **Step 4:** `bunx tsc --noEmit` + `bun run lint` + `bun run build` clean.
- [ ] **Step 5: commit** `git commit -am "feat(agent): nav + link de configuración del Agente IA (gateado)"`

---

### Task 5: Gauntlet final
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` — todo verde.
- [ ] commit si hubo autofix.

---

## Self-Review
- Cobertura: gating Premium (T1), config+tools persistencia con validación (T2, testeada), panel UI (T3), nav+guard+upgrade redirect (T4).
- Tipos: `updateAgentConfig` input ⊆ campos de `agentConfigs`; `setAgentTool` valida contra `BUILTIN_TOOLS`. Las actions reusan los helpers.
- YAGNI: el UI de conectores HTTP avanzados se difiere (el motor ya lo soporta; se puede sembrar vía DB). Plantillas = presets locales simples.
- Riesgo: el patrón `module` en NavItem/NavLink debe existir del trabajo de planes; si no, el implementer lo añade siguiendo cómo se bloquean los otros módulos.

## Resultado al terminar A+B+C
Agente IA multi-tenant funcional: configurable por org desde el panel (Premium), responde por WhatsApp con tools determinísticas, hace handoff a humanos, y registra costo/actividad. Capacidades siguientes (agenda, productos, RAG, ecommerce) se enchufan al registry como sub-proyectos.
