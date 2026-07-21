# Gateway de IA administrado ("IA incluida en el plan") — Diseño

**Fecha:** 2026-07-21 · **Rama:** ia-managed-gateway-jul21

## Problema

Hoy el agente usa **BYOK**: cada org pega su propia API key de OpenAI/Anthropic y elige un modelo técnico. Ningún dueño de negocio no técnico va a crear cuenta de developer y sacar una key, así que el agente IA —el diferenciador de Lula— es prácticamente invendible tal cual.

## Decisión (tomada con Luis, 2026-07-21)

Lula pasa a **revender la IA incluida en el plan**. El cliente no ve modelos ni API keys: recibe un asistente que "simplemente funciona", con una cuota mensual justa.

- **Nivel de calidad fijo por plan:** Esencial y Pro → **Estándar**; Premium → **Premium**.
- **Estándar = Gemini 2.5 Flash**. **Premium = Claude Haiku 4.5** (CORREGIDO tras auditoría 2026-07-21: Sonnet incluido es financieramente inviable — a tope de cuota costaría ~12× el precio del plan Premium; Sonnet queda disponible solo vía BYOK).
- **Prompt caching OBLIGATORIO** en ambos providers (Anthropic `cache_control` en system+tools; Gemini usa caching implícito): reduce el costo de input ~75% y es lo que hace viables las cuotas.
- **Cuota = conversaciones atendidas por la IA al mes** (una conversación distinta con ≥1 turno del agente cuenta 1). Entendible para el cliente.
- **Al agotar la cuota:** el agente se pausa (las conversaciones caen a atención humana en el inbox, como ya ocurre hoy cuando el agente no responde), se avisa en el panel y se ofrece subir de plan. Cero riesgo de sobrecosto para Lula.

## No-objetivos (esta fase)

- Cobro de add-on por excedente (el excedente se resuelve subiendo de plan por ahora).
- Que el cliente elija modelo o proveedor.
- Embeddings/RAG con Gemini (siguen con OpenAI, que es baratísimo).

## Arquitectura

### 1. Dos modos de gateway (retrocompatibilidad)

`GatewayConfig` gana un modo derivado:

- **Managed (default para todos):** la org **no** tiene key propia → usa las **keys maestras de Lula** (env) y el **modelo del tier de su plan**. Aquí Lula paga el consumo, así que **aplica cuota**.
- **BYOK (avanzado / legacy):** la org tiene su propia key configurada → sigue usándola con el modelo que eligió. **Sin cuota** (paga el cliente). Preserva la única org que hoy tiene key en prod y da salida a power-users.

`resolveChatProvider` decide el modo: si hay `openaiKeyEnc`/`anthropicKeyEnc` de la org → BYOK; si no → managed (resuelve provider+modelo desde el plan y las keys de env).

Hallazgos de auditoría que la implementación DEBE cubrir:
- **Org sin fila en `ai_gateway`** (todas las nuevas): hoy `resolveChatProvider` retorna error y el turno manda el fallbackMessage. En managed, la ausencia de fila (o de keys de org) resuelve al tier del plan — sin configuración previa.
- **RAG en managed:** `resolveEmbeddingProvider` hoy exige la `openaiKey` de la ORG → en managed el conocimiento (RAG) moriría en silencio. Debe caer a `LULA_OPENAI_KEY` cuando la org no tenga key propia.
- **Tope de costo por defecto en managed:** `monthlyCostCapCop` default es null (sin freno). En managed se aplica un tope interno automático = 3× el costo esperado de la cuota del plan (cinturón contra loops/abusos), además de la cuota de conversaciones.
- **`cost.ts`:** añadir tarifas por `provider:model` para google y diferenciar haiku/sonnet en anthropic — hoy google caería a la tarifa de openai y subestimaría el output.

### 2. Keys maestras (env, validadas con zod en `src/lib/env.ts`)

```
LULA_GOOGLE_KEY      # Gemini (tier Estándar)
LULA_ANTHROPIC_KEY   # Sonnet (tier Premium)
LULA_OPENAI_KEY      # embeddings/RAG en modo managed
```
Si el tier de un plan apunta a un proveedor cuya key maestra falta → error claro en el panel ("La IA no está disponible temporalmente"), nunca un 500.

### 3. Provider Gemini nuevo

`src/lib/agent/providers/google.ts` → `makeGoogleProvider(client)` implementando la interfaz `LlmProvider` existente (`chat({system, messages, tools, temperature, model}) → {text, toolCalls, usage}`) con function calling y conteo de tokens. Dependencia nueva: `@google/genai`. Se registra junto a openai/anthropic; `chatProvider` acepta `"google"`.

### 4. Tiers y cuotas por plan (código, precios editables como hoy)

En `src/lib/billing/plans.ts` (o un `ia-tiers.ts` vecino):

```ts
type IaTier = "estandar" | "premium";
PLAN_IA_TIER: Record<PlanId, IaTier> = { esencial: "estandar", pro: "estandar", premium: "premium" };

IA_TIER_MODEL: Record<IaTier, { provider: "google" | "anthropic"; model: string }> = {
  estandar: { provider: "google",    model: "gemini-2.5-flash" },   // verificar id con llamada real al implementar
  premium:  { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
};

// Conversaciones IA/mes incluidas (defaults de arranque, editables desde /admin vía appConfig).
// Derivadas de costo real por conversación CON caching (~15 COP Flash, ~36 COP Haiku)
// y exposición máxima ≤ ~55% del precio del plan a tope de cuota:
PLAN_IA_QUOTA: Record<PlanId, number> = { esencial: 500, pro: 1500, premium: 1500 };
// esencial: 500×15 ≈ 7.500 COP (15% del plan) · pro: 1500×15 ≈ 22.500 (32%) · premium: 1500×36 ≈ 54.000 (54%)
// Recalibrar con telemetría real (agent_runs ya guarda tokens) a las 2-4 semanas.
```

### 5. Medición y enforcement de cuota

- `monthlyAgentConversations(db, orgId, now)` → cuenta `COUNT(DISTINCT conversation_id)` en `agent_runs` con `status='ok'` del mes calendario en curso (índice `agent_runs_org_idx` ya existe).
- `isOverIaQuota(db, orgId, planId)` → `monthlyAgentConversations >= quota(planId)`. **Solo aplica en modo managed.**
- En `turn.ts`, antes de correr el loop: si managed y `isOverIaQuota` → registrar `agent_runs` con `status='quota'` y retornar sin responder (la conversación queda para humano). Se conserva el `isOverCostCap` actual como tope duro adicional.

### 6. UI Configuración › IA (rediseño)

- **Managed (default):** tarjeta con el nivel del plan (badge "IA Estándar" / "IA Premium" + una frase de qué significa), barra de cuota **usadas / incluidas** del mes, y CTA "Subir de plan" si va > 80%. Sin campos de API key ni selector de modelo.
- **Avanzado (colapsado):** "¿Tienes tu propia cuenta de OpenAI/Anthropic? Úsala aquí" → el form BYOK actual, que activa el modo BYOK (sin cuota). Para técnicos; oculto por defecto.

## Seguridad / costos

- Keys maestras solo en env, nunca al cliente; las de org siguen cifradas AES-GCM.
- La cuota es el freno de gasto de Lula; el `cost cap` mensual sigue como red de seguridad.
- Un cliente no puede forzar modelo Premium desde Esencial: el tier se deriva del plan en el servidor.

## Testing

- Provider Google con fetch/SDK mock: chat simple, con tool calls, mapeo de usage.
- `resolveChatProvider`: managed sin key de org → provider+modelo del tier; BYOK con key de org → respeta su elección; key maestra ausente → error claro.
- Tier/cuota por plan: mapeos correctos; `monthlyAgentConversations` cuenta distinct del mes; `isOverIaQuota` en el borde.
- Enforcement en turn: managed sobre cuota → run 'quota', sin respuesta; BYOK → nunca bloquea por cuota.
- Suite completa + build. Smoke visual del panel IA (managed y avanzado) con la org demo.

## Despliegue

- Migración: ninguna de schema (reusa `agent_runs`, `ai_gateway`). Añadir las 3 env `LULA_*` en el server antes del deploy.
- La org que hoy tiene key en prod queda en BYOK automáticamente (no se toca).
- Verificación prod: panel IA carga en managed; una conversación de prueba responde con Gemini; contador de cuota sube.

## Riesgo residual / futuro

- Sin add-on de excedente: cliente muy activo se topa y debe subir de plan (aceptado por ahora).
- Gemini como dependencia de terceros: si su API cae, el agente Estándar queda sin responder → futuro: fallback a Haiku. Por ahora, error claro + caída a humano.
