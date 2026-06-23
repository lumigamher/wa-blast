# Gateway de modelos IA (BYO key por org)

**Fecha:** 2026-06-23
**Proyecto:** Lula (wa-blast) — agente IA multi-tenant
**Estado:** Diseño aprobado

## Contexto y motivación

Hoy NO existe un punto central para configurar la IA. Hay **tres caminos
independientes** y los tres leen la API key global del `process.env`:

| Función | Cómo obtiene modelo/key hoy |
|---|---|
| Agente (`turn.ts`/`dispatch.ts`) | `getProvider({provider})` lee `process.env.OPENAI_API_KEY`/`ANTHROPIC_API_KEY`; provider/modelo vienen de `agent_configs` (por-org) pero la **key es global** |
| flow-ai (`flow-ai.ts`, builder de Flows) | Cliente OpenAI propio desde `process.env.OPENAI_API_KEY` + `OPENAI_MODEL` |
| RAG embeddings (`rag/embeddings/index.ts`) | `getEmbeddingProvider()` → `process.env.OPENAI_API_KEY` |

Problema: en producción (158.220.123.213) **no hay ninguna key LLM** en `.env.local`
ni en el systemd service, así que ninguna función de IA funciona. Y aunque la
hubiera, sería una sola key compartida por toda la plataforma, no por cliente.

**Objetivo:** un **gateway de modelos por org** — un único punto donde el cliente
configura proveedor + modelo + su propia API key (BYO), del que beben el agente,
flow-ai, los embeddings/RAG y cualquier función de IA futura.

## Decisiones tomadas (brainstorming)

1. **BYO key por org:** cada org pega su propia key (cifrada). Lula no paga
   tokens. Ninguna función de IA opera para una org hasta que configure su key.
   **No hay fallback al env** (se elimina ese camino).
2. **Credenciales por proveedor:** la org puede guardar key de OpenAI y/o de
   Anthropic. El chat usa la del proveedor elegido; los embeddings (solo existen
   en OpenAI) usan la key de OpenAI si existe; si no, RAG queda apagado para esa
   org.
3. **Un modelo por org (v1):** un proveedor + modelo de chat por org que usan
   agente y flow-ai por igual. Sin modelo por-función. Consecuencia: el selector
   de modelo curado recién agregado al form del agente **se relocaliza al
   gateway**.

## Alcance

Dentro: tabla `ai_gateway`, resolver central, refactor de los 3 consumidores,
UI `/configuracion/ia` con "probar conexión", relocalización del selector de
modelo. Fuera: modelo por-función, key de plataforma/fallback, proveedores
distintos de OpenAI/Anthropic, embeddings no-OpenAI.

## Componente 1 — Modelo de datos

Tabla nueva `ai_gateway` (Drizzle SQLite, nueva migración), una fila por org:

```ts
export const aiGateway = sqliteTable("ai_gateway", {
  orgId: text("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  chatProvider: text("chat_provider", { enum: ["openai", "anthropic"] }).notNull().default("openai"),
  chatModel: text("chat_model").notNull().default("gpt-5-mini"),
  openaiKeyEnc: text("openai_key_enc"),
  anthropicKeyEnc: text("anthropic_key_enc"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

Las keys se cifran con `src/lib/crypto/encrypt` (`encrypt`/`decrypt`), igual que
`agent_catalog`/`agent_shipping`. El dropdown de modelos reutiliza
`CURATED_MODELS` de `src/lib/agent/providers/models.ts` (ya aislado sin SDK).

## Componente 2 — Gateway (`src/lib/ai/gateway/`)

Módulo nuevo, una responsabilidad: resolver el proveedor de IA por org.

### `config.ts`
```ts
export type GatewayConfig = {
  chatProvider: "openai" | "anthropic";
  chatModel: string;
  openaiKey: string | null;     // descifrada
  anthropicKey: string | null;  // descifrada
};
export async function getGatewayConfig(db: DB, orgId: string): Promise<GatewayConfig | null>;
// patch parcial; cifra las keys; si una key llega vacía/undefined CONSERVA la guardada
export async function saveGatewayConfig(db: DB, orgId: string, patch: {
  chatProvider?: "openai" | "anthropic";
  chatModel?: string;
  openaiKey?: string;     // "" o ausente = no cambiar
  anthropicKey?: string;
}): Promise<void>;
```

### `resolve.ts`
```ts
// Devuelve el provider de chat listo (cliente armado con la key por-org) o un error legible.
export async function resolveChatProvider(db: DB, orgId: string): Promise<
  | { ok: true; provider: LlmProvider; model: string }
  | { ok: false; error: string }
>;
// Embeddings = solo OpenAI. null si la org no tiene key OpenAI (RAG se salta).
export async function resolveEmbeddingProvider(db: DB, orgId: string): Promise<EmbeddingProvider | null>;
```

Implementación: lee `getGatewayConfig`; según `chatProvider` toma la key
correspondiente; si falta → `{ ok:false, error:"Configura tu API key de <proveedor> en Configuración › IA" }`.
Reutiliza `makeOpenAiProvider`/`makeAnthropicProvider` (de `providers/`) y
`makeOpenAiEmbeddingProvider` (de `rag/embeddings/openai`), inyectando un cliente
`new OpenAI({apiKey})` / `new Anthropic({apiKey})` construido con la key por-org.
Nunca lanza por red; los errores de credencial se devuelven como `{ok:false}`.

## Componente 3 — Refactor de los 3 consumidores

**Agente** (`turn.ts`, `dispatch.ts`):
- Reemplazar `getProvider({ provider: config.provider })` + `config.model` por
  `resolveChatProvider(db, orgId)`.
- Si `{ok:false}`: el turno NO crashea — envía `agent_configs.fallbackMessage`
  (o escala) y registra el run como degradado. Temperatura/persona siguen
  leyéndose de `agent_configs`.
- `turn.ts` ya acepta `deps.provider` inyectable (tests): se mantiene; si no se
  inyecta, usa el resolver.

**flow-ai** (`flow-ai.ts`, `flows/nueva/actions.ts`):
- `generateFlowJson(request)` → `generateFlowJson(request, { db, orgId })`.
- Usa `resolveChatProvider`; si `{ok:false}` lanza/retorna un error que el server
  action muestra al usuario ("Configura tu API key en Configuración › IA").
- Usa `provider.chat(...)` (la abstracción `LlmProvider`) en vez del cliente
  OpenAI crudo, para no duplicar credenciales. (El prompt/lógica de extracción de
  JSON se conservan.)

**Embeddings/RAG** (`rag/embeddings/index.ts` y callers):
- `getEmbeddingProvider()` → `getEmbeddingProvider(db, orgId)` (o se sustituye su
  uso por `resolveEmbeddingProvider`). Callers: `turn.ts` (auto-RAG),
  `tools/builtin/buscar-en-docs.ts`, `rag/ingest.ts` — todos pasan orgId (ya
  tienen `ctx.db`/`ctx.orgId` u orgId en su firma).
- `null` → mismo comportamiento actual de "sin docs": se salta, no rompe el turno.

Tras migrar callers, se **eliminan** `getProvider` (versión env) de
`providers/index.ts` y el `getEmbeddingProvider()` sin args. Se conservan
`makeOpenAiProvider`/`makeAnthropicProvider`/`makeOpenAiEmbeddingProvider`
(fábricas puras que reciben el cliente) — el resolver las usa.

## Componente 4 — UI `/configuracion/ia`

Nueva ruta a nivel de cuenta (NO bajo `/configuracion/agente`, porque alimenta
todas las funciones de IA). Server component que carga `getGatewayConfig` +
client component `_gateway-form.tsx`.

- **Proveedor de chat:** `<Select>` OpenAI/Anthropic.
- **Modelo:** `<Select>` con `CURATED_MODELS[chatProvider]` + opción
  "Personalizado…" que revela input libre (mismo patrón que el selector que ya
  construimos).
- **API keys:** dos campos password — "API key de OpenAI" y "API key de
  Anthropic" — con placeholder "•••• (déjalo vacío para no cambiarla)" cuando ya
  hay una guardada. Texto de ayuda: OpenAI es obligatoria si quieres RAG.
- **Probar conexión:** botón → server action `testGatewayKeyAction(provider)`
  que hace una llamada mínima (1 token / listar modelos / `chat` trivial) con la
  key recién guardada y devuelve ✅/❌ con el mensaje de error si falla.
- Link en el sidebar (`src/app/(app)/layout.tsx`), sección de configuración de
  cuenta (junto a los ítems STANDALONE, visible a admins de la org).

Gating: visible para admins de la org (BYO key es responsabilidad del cliente).
Cada función conserva su propio gating (agente = Premium, etc.).

## Componente 5 — Relocalización del selector del agente

`src/app/(app)/configuracion/agente/_form.tsx`: se **elimina** el bloque
Proveedor + Modelo (y su estado `customModel`/`initialModelIsCurated`). El agente
hereda proveedor/modelo del gateway. `saveAgentConfigAction` deja de recibir
`provider`/`model`. Las columnas `agent_configs.provider`/`model` quedan
vestigiales: se **eliminan en la misma migración** (Drizzle) para no dejar estado
muerto; `getAgentConfig`/`saveAgentConfig` y sus tipos se ajustan. (Temperatura,
persona, fallback, tope de costo, etc. se mantienen en `agent_configs`.)

`CURATED_MODELS`/`models.ts` se reutiliza tal cual en el form del gateway.

## Componente 6 — Tests

- `gateway/config`: encrypt/decrypt round-trip; `saveGatewayConfig` conserva la
  key existente si llega vacía; descifra ambas keys.
- `gateway/resolve`: `resolveChatProvider` con key presente (openai y anthropic),
  sin key → `{ok:false}`; `resolveEmbeddingProvider` con/sin openai key;
  chatProvider=anthropic pero embeddings siguen usando la key de OpenAI.
- Consumidores: `turn.ts` con resolver mockeado a `{ok:false}` → envía fallback,
  no crashea; `generateFlowJson` sin key → error legible; auto-RAG con
  `resolveEmbeddingProvider`=null → se salta.
- UI: `testGatewayKeyAction` con cliente mockeado (éxito y fallo).

Convención: `bunx vitest run`, mocks de `fetch`/SDK como en el resto del repo.

## Migración y despliegue

- Migración Drizzle: crea `ai_gateway`; elimina `agent_configs.provider` y
  `agent_configs.model`.
- No hay datos que preservar (ninguna org tiene key hoy; prod no tiene key env).
- Para que una org use IA tras esto: Configuración › IA → elegir proveedor +
  modelo + pegar su key → "Probar conexión".
- **Verificación en vivo:** con una key real, probar (a) "Probar conexión" ✅,
  (b) un turno del agente contra el catálogo Medusa de El Man, (c) que flow-ai
  genera un Flow, (d) que RAG indexa/recupera.

## Riesgos / notas

- **flow-ai vía `LlmProvider.chat`:** hay que confirmar que la abstracción
  soporta el modo "responde JSON" que flow-ai necesita (hoy usa el cliente OpenAI
  directo). Si la abstracción no basta, el resolver puede exponer también la key
  cruda para que flow-ai arme su cliente — pero la fuente de la key sigue siendo
  el gateway. Decisión en el plan tras leer `flow-ai.ts` y `providers/openai.ts`.
- **Sin key = función degradada, no error 500:** cada consumidor debe degradar
  con gracia (agente → fallback, flow-ai → error de formulario, RAG → off).
- El selector de modelo del agente se shipeó ayer (2026-06-22); relocalizarlo es
  intencional (consecuencia de "un modelo por org"), no un retroceso.
