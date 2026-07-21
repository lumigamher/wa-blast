# Gateway de IA: conexión fácil de proveedores + modelos dinámicos — Diseño

**Fecha:** 2026-07-21 · **Rama:** ia-managed-gateway-jul21 (v2 — dirección corregida por Luis)

## Historia de la decisión

- v1 propuso "IA incluida en el plan" (Lula revende con keys maestras y cuotas). La auditoría
  mostró números viables solo con Haiku+caching, y **Luis descartó la reventa**: no quiere
  intermediar costos de IA.
- **v2 (esta):** BYOK se queda, pero deja de ser hostil. El cliente conecta su proveedor y
  Lula le muestra fácil los modelos disponibles de ESE proveedor, en vivo.

## Objetivo

Que un cliente (o Lula configurándole la cuenta) pueda: pegar la key de su proveedor →
ver "Conectado" → elegir modelo de una lista real y actualizada de ese proveedor →
listo. Sin listas quemadas, sin adivinar ids de modelo.

## Alcance

### 1. Proveedores soportados (ai_gateway)

| Provider | Auth | Modelos (listado en vivo) |
|---|---|---|
| `openai` | key | `GET https://api.openai.com/v1/models` |
| `anthropic` | key | `GET https://api.anthropic.com/v1/models` (x-api-key + anthropic-version) |
| `google` (NUEVO) | key | `GET https://generativelanguage.googleapis.com/v1beta/models?key=` |
| `custom` (NUEVO, "Compatible OpenAI") | baseUrl + key | `GET {baseUrl}/models` — cubre OpenRouter, Groq, DeepSeek, Ollama expuesto, etc. |

Schema: `ai_gateway` gana `google_key_enc`, `custom_key_enc`, `custom_base_url` (mig 0036,
ADD COLUMNs). `chat_provider` acepta los 4 valores.

### 2. Provider runtime Google (nuevo)

`src/lib/agent/providers/google.ts` implementa `LlmProvider` (chat con system, historial,
function calling y usage) contra la REST API de Gemini (`generateContent`) — sin SDK nuevo
si es razonable, o `@google/genai` si simplifica el function calling. `custom` reusa el
provider OpenAI con `baseURL`.

### 3. Listado dinámico de modelos

`src/lib/ai/gateway/list-models.ts`:

```ts
type ListedModel = { id: string; label: string; hint?: string; recommended?: boolean };
listProviderModels(provider, key, baseUrl?) => Promise<{ ok: true; models: ListedModel[] } | { ok: false; error: string }>
```

- Fetch en vivo con timeout 10s; errores traducidos a lenguaje claro (key inválida,
  sin permisos, URL no responde).
- Filtro por provider: openai → `gpt-*`/`o*` (sin embeddings/tts/whisper/dall-e);
  anthropic → `claude-*`; google → `gemini-*` que soporten generateContent; custom → todos.
- Enriquecimiento: los ids que estén en la shortlist curada llevan `label`/`hint`/
  `recommended: true` y se ordenan primero; el resto va debajo con su id tal cual.
- La shortlist curada reemplaza a CURATED_MODELS (sin emojis; costo como texto:
  "económico" / "equilibrado" / "premium").

Server action `listModelsAction()` en configuración/ia: usa la key YA guardada de la org
(nunca recibe la key del cliente de vuelta) y devuelve la lista.

### 4. Validación al guardar

`saveGatewayAction` con key nueva → antes de persistir, prueba la key con
`listProviderModels`. Si falla → guarda igual PERO devuelve estado de conexión con el
error claro (el cliente puede estar sin red del proveedor); la UI muestra
"Conectado" / "No pudimos validar: {motivo}".

### 5. UI Configuración › IA (rediseño)

- 4 cards de proveedor (OpenAI, Anthropic, Google Gemini, Compatible OpenAI) con estado:
  "Conectado" (key guardada + validada) / "Sin conectar". Key input write-only con badge
  "guardada"; custom pide además la URL base.
- Al conectar (o al abrir con key ya guardada): selector de modelo dinámico — grupo
  "Recomendados" arriba (label + hint + costo en texto), luego "Todos los modelos" con
  buscador si son >8.
- Se elige provider activo + modelo → guardar. Copy es-CO, sin jerga, sin emojis
  (iconos lucide).
- Aviso pequeño: "El consumo de IA se cobra directo en tu cuenta de {proveedor}".

### 6. Costeo interno

`cost.ts`: tarifas por `provider:model` para google y anthropic (haiku vs sonnet) y
default razonable para custom (tarifa openai). Solo afecta la estimación en COP del panel.

## No-objetivos

- Reventa/cuotas/keys maestras (descartado por Luis).
- Embeddings con Google (RAG sigue exigiendo key de OpenAI de la org, como hoy — se
  muestra hint en la UI cuando el provider activo no es openai: "Para la base de
  conocimiento necesitas conectar también OpenAI").

## Testing

- list-models: 4 providers con fetch mock (formatos reales de respuesta), filtros,
  enriquecimiento, errores traducidos.
- Provider google: chat simple + tool calls + usage con fetch/SDK mock.
- resolve: google y custom (baseURL) resuelven; sin key → error claro actual.
- config: guardar/leer campos nuevos cifrados.
- Suite completa + build + smoke visual del panel (estados sin conectar/conectado-inválido).

## Despliegue

Migración 0036 automática en deploy. Sin env nuevas. La org BYOK existente en prod no
cambia (openai/anthropic siguen igual).
