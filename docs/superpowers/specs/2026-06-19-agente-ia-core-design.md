# Spec: Agente IA core (multi-tenant) para Lula

**Fecha:** 2026-06-19
**Estado:** aprobado (diseño) — pendiente plan de implementación
**Sub-proyecto:** #1 de la plataforma de Agente IA (core/fundación)

## Contexto

Lula (wa-blast) es un SaaS multi-tenant de WhatsApp (campañas, inbox, flows) sobre la
API oficial de Meta. Cada organización es un tenant (Better Auth orgs). Ya existe:
inbox multiagente (humanos por org), webhook entrante (`src/lib/meta/webhook-handlers.ts`),
persistencia de mensajes (`src/lib/inbox/store.ts`), cliente Meta, e IA puntual
(`src/lib/flow-ai.ts`, OpenAI, para generar Flows). Hay envs `OPENAI_API_KEY` y
`ANTHROPIC_API_KEY`. DB = sqlite local (Drizzle, better-sqlite3). Acabamos de lanzar
gating por módulos + planes (Esencial/Pro/Premium).

Este spec cubre el **core del agente IA**: el motor conversacional + agéntico,
configurable por organización, sobre el que se enchufarán capacidades posteriores
(agenda, productos/ventas, RAG, ecommerce) como sub-proyectos separados.

Antecedente: Luis ya construyó un agente comercial single-tenant (clonai-agent/JuanDa)
con debounce, handoff, calificación y escalamiento. Reusamos esos **patrones** (no
código; ClonAI y Lula siguen separados).

## Decisiones (brainstorm 2026-06-19)

1. **Trabajo v1:** asistente configurable por prompt (el comportamiento lo define la
   persona/prompt por org; sirve para soporte, ventas o reservas según config).
2. **Control:** agente responde por defecto cuando está ON; si un humano contesta esa
   conversación, el agente se **pausa** ahí automáticamente (handoff). El humano puede
   devolver la conversación al agente.
3. **LLM:** **configurable por organización** (provider + modelo), detrás de una
   abstracción `LlmProvider`. Soporte v1: OpenAI y Anthropic (Claude).
4. **Tools:** híbrido — **built-in** (curadas, deterministas) + **conectores HTTP**
   configurables por org ("trae tu API").
5. **Configuración:** híbrido — **plantillas self-serve** por caso de uso + **modo
   avanzado** (prompt crudo, conectores, provider/modelo) para power users / equipo Lula.
6. **Runtime:** **in-process** en Lula, con worker desacoplado por cola interna y
   frontera de módulo limpia (extraíble a microservicio si el volumen lo exige).
7. **Gating:** "Agente IA" es un **módulo gateable** nuevo. Default: **Premium**
   (revisable). Se integra al sistema de planes ya existente (`plans.ts` ModuleId).

## Objetivos / No-objetivos

**Objetivos (v1):**
- Framework agéntico robusto: loop LLM ↔ tools, provider-agnóstico, determinístico.
- Config por org (tablas + panel básico/avanzado + plantillas).
- Tools built-in: `calcular_total`, `escalar_a_humano`, `recopilar_datos`.
- Conector HTTP configurable (fábrica de tools desde config de la org).
- Handoff automático (pausa por respuesta humana) + reanudar.
- Guardrails: máx pasos/turno, tope de costo mensual por org, rate-limit, debounce.
- Observabilidad: log de cada turno (`agent_runs`) con pasos, tokens y costo.

**No-objetivos (sub-proyectos posteriores):**
- Agenda/calendario (tool `agendar`).
- Productos/pedidos/venta automática.
- RAG / base documental.
- Sincronización ecommerce (Shopify/etc.).
- Migración a Postgres / microservicio.

## Principio de diseño: el LLM razona, el código ejecuta

El LLM (temperatura baja) solo decide **qué tool** llamar y **con qué argumentos**.
Los args se **validan con zod**; el **código** de la tool ejecuta (p.ej. `calcular_total`
suma de verdad, el LLM nunca calcula). Las tools devuelven datos estructurados que el
LLM **narra** con tono natural. Resultado: conversación humanizada por fuera, ejecución
exacta y auditable por dentro. Tools sensibles (futuras: agendar/vender) llevarán paso
de confirmación.

## Arquitectura (in-process)

```
Meta webhook (existe) → persiste mensaje (existe)
   └─ si org.agente ON y conversación NO pausada → encola "turno de agente" (debounced)
        └─ agent worker (proceso/loop desacoplado, mismo box, mismo sqlite)
             ├─ context.ts: arma system prompt (persona+reglas) + historial + tools habilitadas
             ├─ runtime.ts: loop LLM ↔ tools (máx N pasos) hasta respuesta final
             │     ├─ providers/{openai,anthropic} (elegido por org)
             │     └─ tools/registry (built-in + httpConnector)
             ├─ guardrails: máx pasos, tope costo, rate-limit, anti-repetición
             ├─ envía respuesta vía cliente Meta (existe) + recordOutboundMessage (existe)
             └─ agent_runs: registra el turno (pasos/tokens/costo/status)

Humano contesta la conversación → marca conversations.agentPaused = true (agente calla ahí)
```

## Componentes (unidades aisladas)

Carpeta `src/lib/agent/`:

- `config.ts` — CRUD de `AgentConfig` por org (load/save). Interfaz: `getAgentConfig(db,orgId)`,
  `saveAgentConfig(db,orgId,patch)`.
- `providers/types.ts` — interfaz `LlmProvider`:
  `chat(input: { system, messages, tools, temperature }): Promise<{ toolCalls?, text? , usage }>`.
- `providers/openai.ts`, `providers/anthropic.ts` — implementan `LlmProvider`.
- `providers/index.ts` — `getProvider(config): LlmProvider` (selecciona por org).
- `tools/types.ts` — `AgentTool = { name, description, paramsSchema: ZodSchema, run(args, ctx): Promise<ToolResult> }`.
- `tools/builtin/{calcular-total,escalar-humano,recopilar-datos}.ts`.
- `tools/http-connector.ts` — fábrica: dado `HttpConnectorConfig`, devuelve un `AgentTool`
  (valida args con un schema derivado, hace fetch, mapea respuesta).
- `tools/registry.ts` — `resolveTools(db, orgId): AgentTool[]` (built-ins habilitadas + conectores HTTP de la org).
- `context.ts` — `buildContext(db, orgId, conversationId, config): { system, messages }`.
- `runtime.ts` — `runAgentLoop({ provider, tools, context, guardrails }): Promise<AgentTurnResult>`.
- `turn.ts` — `handleAgentTurn(db, orgId, conversationId)`: debounce, gating, pausa, corre runtime, envía, registra run.
- `guardrails.ts` — límites (pasos, costo mensual, rate-limit), anti-repetición.
- `pause.ts` — `pauseAgent`, `resumeAgent`, `isPaused` (estado handoff).
- `queue.ts` — cola interna (reusa el patrón del worker de campañas) para encolar turnos.

Cada unidad: una responsabilidad, interfaz clara, testeable aislada (especialmente `runtime`
con un `LlmProvider` falso).

## Modelo de datos (tablas nuevas, sqlite/Drizzle)

- `agent_configs` (orgId PK → organization, cascade):
  enabled (bool, default false), name, systemPrompt (persona+reglas), provider
  ("openai"|"anthropic"), model, temperature (real, default 0.2), businessHoursJson
  (nullable), fallbackMessage, maxStepsPerTurn (int, default 5), monthlyCostCapCop
  (int, nullable), templateId (nullable), advancedMode (bool, default false),
  updatedAt.
- `agent_tools` (id PK, orgId → cascade): type ("builtin"|"http"), key (ej.
  "calcular_total" o nombre del conector), enabled (bool), configJson (para http:
  method/url/headers/auth/paramsSchema/responseMapping), createdAt.
- `agent_runs` (id PK, orgId → cascade, conversationId → set null): stepsJson (traza de
  pasos/tools), promptTokens, completionTokens, costCop, status ("ok"|"error"|"capped"|"paused"),
  errorMessage (nullable), createdAt. Índice (orgId, createdAt).
- `conversations`: + columna `agentPaused` (bool, default false). (handoff)

## Loop agéntico (determinismo)

1. `buildContext` arma el system prompt (persona + reglas globales + lista de tools) +
   historial reciente de la conversación (límite de mensajes/tokens).
2. `runAgentLoop` llama al provider (temperatura de la org, baja por defecto) pasando los
   schemas de tools habilitadas.
3. Si el LLM devuelve **tool_call**: valida args con zod → si inválidos, devuelve error
   estructurado al LLM (reintento acotado); si válidos, ejecuta `tool.run` (código) →
   alimenta el resultado de vuelta → repite. Tope `maxStepsPerTurn`.
4. Si el LLM devuelve **texto**: esa es la respuesta → enviar.
5. Tope de pasos alcanzado sin respuesta → fallbackMessage + status "capped".
6. Cada paso se acumula en la traza para `agent_runs`.

## Tools built-in v1

- `calcular_total(items: {nombre, cantidad, precioUnitario}[]) → { total, desglose }` —
  suma determinística. Caso de uso "venta por WhatsApp" sin alucinar números.
- `escalar_a_humano(motivo) → { escalado: true }` — marca la conversación para humano
  (pausa el agente, notifica al equipo).
- `recopilar_datos(campos) → { ... }` — pide/registra datos estructurados del contacto
  (puente hacia enriquecimiento de contacto, reusa patrón de flows responses).

## Conector HTTP (modo avanzado)

`HttpConnectorConfig`: { name, description, method, urlTemplate, headers, auth
(none|bearer|apiKey), params: [{ name, type, required, in: path|query|body }],
responseMapping (qué del JSON devolver al LLM) }. La fábrica `http-connector.ts` deriva
un `paramsSchema` zod, hace el fetch con timeout, valida y mapea. Permite integrar
productos/ecommerce externos sin desplegar código. Guardrails: timeout, allowlist de
dominios opcional, sin secretos en logs.

## Panel `/configuracion/agente`

Nuevo módulo gateable ("agente" en `plans.ts`; default Premium). Server component +
acciones, gated con `requireModuleAccess("agente")`.
- **Plantillas:** atención / ventas / reservas → prellenan systemPrompt + tools recomendadas.
- **Básico:** on/off, nombre, persona, fallback, horario.
- **Tools:** built-ins (toggle + config) + "agregar conector HTTP" (avanzado).
- **Avanzado:** prompt crudo, provider/modelo, temperatura, topes de costo.
- **Actividad:** vista de `agent_runs` (turnos, costo, escalamientos) para observabilidad.

## Guardrails / costo

- `maxStepsPerTurn` (default 5) — corta loops.
- `monthlyCostCapCop` por org — al superar, agente OFF temporal + aviso (status "capped").
- Rate-limit por conversación (evita ráfagas).
- Debounce: agrupa mensajes rápidos del contacto antes de responder (~pocos segundos).
- Ventana 24h de Meta: si fuera de ventana, no free-text → fallback/skip (reusa manejo de Lula).
- Anti-repetición: no repetir la última pregunta/respuesta del bot.

## Integración con lo existente

- Hook en el pipeline del webhook entrante (tras persistir): encolar turno si aplica.
- Handoff: en `recordOutboundMessage` de un humano (o acción "tomar conversación") →
  `pauseAgent`. Acción "devolver al agente" → `resumeAgent`.
- Gating: `ModuleId` "agente" en `plans.ts`; nav + guard de `/configuracion/agente`.
- Reusa: cliente Meta, inbox store, contactos, cola estilo worker de campañas.

## Testing

- **Unit:** `calcular_total` (exactitud), validación de args (zod rechaza basura), fábrica
  de conector HTTP (mapeo args/respuesta, timeout), guardrails (topes), `pause` (estado).
- **Integración del loop:** `runtime.ts` con un `LlmProvider` **falso** que devuelve
  tool_calls scripteados → asserts de ejecución determinística, encadenamiento de tools,
  respuesta final y traza de `agent_runs`. Sin API real.
- **Gating:** `/configuracion/agente` redirige sin módulo; agente no corre si org sin acceso.

## Riesgos / mitigaciones

- **Costo LLM desbocado** → tope mensual por org + log de costo por turno.
- **Agente pisa a humano** → handoff por pausa automática (decisión 2) + tests.
- **Alucinación en acciones** → split LLM/tools + zod + confirmación en tools sensibles.
- **Carga degradando el inbox** → worker desacoplado; frontera limpia para microservicio.
- **Conector HTTP inseguro** → timeout, auth tipada, sin secretos en logs, allowlist opcional.

## Alcance v1 (resumen)

Framework + runtime + ambos providers + config (tablas + panel básico/avanzado +
plantillas) + built-ins (`calcular_total`, `escalar_a_humano`, `recopilar_datos`) +
conector HTTP + handoff/pausa + guardrails + `agent_runs`. Las capacidades agenda,
productos, RAG y ecommerce son sub-proyectos posteriores que se enchufan al registry.
