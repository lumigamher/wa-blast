# Conector Medusa nativo + selector de modelo curado

**Fecha:** 2026-06-22
**Proyecto:** Lula (wa-blast) — agente IA multi-tenant
**Estado:** Diseño aprobado

## Contexto y motivación

Queremos probar el agente de Lula contra una tienda real: **El Man de los
Teclados**, que corre **Medusa v2** con backend en
`https://api.elmandelosteclados.com` (health `OK`).

El cliente debe poder conectar su ecommerce desde la configuración nativa del
agente (`configuracion/agente/catalogo`) y que el agente cotice/arme pedidos con
datos vivos.

### Por qué no sirve el conector HTTP genérico actual

`src/lib/agent/integrations/catalog/http.ts` no puede hablar con Medusa v2:

1. Manda `Authorization: Bearer <apiKey>`. Medusa v2 exige el header
   `x-publishable-api-key` y devuelve `400 not_allowed` sin él (verificado en
   vivo contra `/store/products` y `/store/regions`).
2. Lee un único campo de precio plano. En Medusa el precio va anidado en
   `variants[].calculated_price.calculated_amount` y solo se calcula si se pasa
   `region_id`. Con el conector actual todos los productos saldrían filtrados
   (precio `NaN` → descartados).

Por eso añadimos un **conector Medusa dedicado** (patrón idéntico al de
Shopify), en vez de forzar el HTTP genérico.

### Estado del panel de IA

`configuracion/agente/_form.tsx` ya expone al cliente: proveedor
(OpenAI/Anthropic), modelo (input de texto libre), temperatura y personalidad
(`systemPrompt`). El input de texto libre permite escribir modelos inválidos;
lo cambiamos por un selector curado.

## Alcance

1. **Conector Medusa nativo** — nuevo proveedor de catálogo "medusa".
2. **Selector de modelo curado** — dropdown por proveedor con opción
   "Personalizado…".
3. **Prueba end-to-end en vivo** contra El Man de los Teclados.

Fuera de alcance: cambiar la lógica de selección de proveedor LLM, escritura
(pedidos) hacia Medusa (el agente sigue creando pedidos en el store interno de
Lula), webhooks de inventario.

## Componente 1 — Conector Medusa (`makeMedusaCatalog`)

### Archivos
- Nuevo: `src/lib/agent/integrations/catalog/medusa.ts`
- Nuevo: `src/lib/agent/integrations/catalog/medusa.test.ts`
- Editar: `src/lib/agent/integrations/catalog/index.ts` — `case "medusa"`.
- Editar: `src/lib/agent/integrations/catalog/config.ts` — el union
  `provider` pasa a `"internal" | "http" | "shopify" | "medusa"`.
- Editar: `src/app/(app)/configuracion/agente/_catalog.tsx` — bloque de campos
  cuando `provider === "medusa"` + opción en el `<Select>` de proveedor.

### Interfaz
Implementa `CatalogProvider` (de `types.ts`):
```ts
makeMedusaCatalog(cfg: {
  backendUrl: string;       // config: https://api.elmandelosteclados.com
  publishableKey: string;   // credencial cifrada → header x-publishable-api-key
  regionId?: string;        // config opcional; si vacío, auto-pick primera región
}): CatalogProvider
```

### Configuración que llena el cliente (`_catalog.tsx`)
- `backendUrl` (config) — URL del backend Medusa.
- `publishableKey` (credencial, cifrada vía `encrypt` en `saveCatalogConfig`).
- `regionId` (config, opcional). Si va vacío, el conector resuelve la región
  automáticamente.

`_catalog.tsx` ya cifra solo `credentials`; `publishableKey` va en
`credentials`, `backendUrl`/`regionId` en `config`.

### Resolución de región
- Si `regionId` viene en config, se usa directo.
- Si no, en la primera llamada el conector hace
  `GET /store/regions` (con header pk), toma `regions[0].id` y lo **cachea en
  memoria** durante la vida del provider (evita una llamada extra por turno).
- Si `/store/regions` falla o no hay regiones, `search`/`get` devuelven
  `[]`/`null` (sin precios fiables no exponemos productos).

### Mapeo Medusa v2 → `Product`
`search({ query, limit = 10 })`:
- `GET {backendUrl}/store/products?q={query}&limit={limit}&region_id={regionId}&fields=*variants.calculated_price,*images`
- Header: `x-publishable-api-key: {publishableKey}`.
- Respuesta `{ products: [...] }`.

Por cada producto:
- `id` ← `product.id`
- `name` ← `product.title`
- `description` ← `product.description ?? null`
- `variants[]` → `ProductVariant`:
  - `id` ← `variant.id`
  - `label` ← `variant.title`
  - `priceCop` ← `Math.round(variant.calculated_price.calculated_amount)`
    (COP no tiene decimales). Si no hay `calculated_price`, la variante se omite.
  - `sku` ← `variant.sku ?? null`
  - `available` ← `variant.allow_backorder === true ||
    (variant.inventory_quantity ?? 0) > 0`. Si el producto no maneja inventario
    (`manage_inventory === false`), `available = true`.
- `priceCop` (nivel producto) ← menor `priceCop` entre las variantes válidas.
- `images[]` → `ProductImage` (`url` ← `image.url`). `product.thumbnail` se
  agrega primero si existe y no está duplicada.
- `available` (nivel producto) ← alguna variante `available`.
- Si el producto no tiene ninguna variante con precio válido → se descarta
  (coherente con HTTP: nunca exponer $0 silencioso).

`get(id)`:
- `GET {backendUrl}/store/products/{id}?region_id={regionId}&fields=*variants.calculated_price,*images`
- Mismo mapeo; devuelve `Product | null`.

### Robustez
- `AbortController` con timeout 8s (igual que HTTP/Shopify).
- Todo en `try/catch`: error de red, no-2xx, JSON inválido → `[]` (search) o
  `null` (get). Nunca lanza: no debe romper el turno del agente.

## Componente 2 — Selector de modelo curado

### Archivos
- Editar: `src/lib/agent/providers/index.ts` — exportar `CURATED_MODELS`.
- Editar: `src/app/(app)/configuracion/agente/_form.tsx` — input de modelo →
  `<Select>` dependiente del proveedor + opción "Personalizado…".

### Constante curada
```ts
export const CURATED_MODELS: Record<"openai" | "anthropic",
  { id: string; label: string; hint: string; cost: "💲" | "💲💲" | "💲💲💲" }[]> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hint: "Rápido, recomendado para WhatsApp de alto volumen", cost: "💲" },
    { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6", hint: "Equilibrado calidad/costo", cost: "💲💲" },
    { id: "claude-opus-4-8",           label: "Claude Opus 4.8",   hint: "Máxima calidad",            cost: "💲💲💲" },
  ],
  openai: [
    { id: "gpt-5-mini",  label: "GPT-5 mini",  hint: "Rápido, recomendado", cost: "💲" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", hint: "Mayor capacidad",     cost: "💲💲" },
  ],
};
```

### Comportamiento del `<Select>`
- Opciones = `CURATED_MODELS[provider]`, cada una muestra `label`, `hint` y
  `cost`.
- Última opción: **"Personalizado…"**. Al elegirla se revela el input de texto
  actual (no perdemos la posibilidad de escribir cualquier modelo).
- Al cambiar de proveedor, si el modelo actual no está en la lista del nuevo
  proveedor, se selecciona el primer modelo curado de ese proveedor.
- Si el `config.model` guardado no está en la lista (modelo viejo/custom), el
  selector arranca en "Personalizado…" con ese valor en el input.

No se toca la lógica de `getProvider` ni el guardado (`saveAgentConfig` ya
persiste `model` como string).

## Componente 3 — Prueba end-to-end en vivo

1. Obtener la `publishable key` de El Man (storefront `.env` en el VPS
   `79.143.177.73` / `elmandelosteclados.com`, o Medusa admin
   `admin.elmandelosteclados.com`).
2. En una org de prueba de Lula, configurar catálogo = Medusa con
   `backendUrl=https://api.elmandelosteclados.com` + pk.
3. Verificar en `configuracion/agente/catalogo` que `search("teclado")` trae
   productos reales con precio en COP.
4. Correr un turno del agente ("¿tienen teclados mecánicos?") y confirmar que
   cotiza con datos vivos.

## Testing

- **`medusa.test.ts`** (TDD, `fetch` mockeado, patrón del repo —
  `bunx vitest run`):
  - `search` mapea producto con variante + precio anidado + imágenes.
  - precio nivel-producto = menor variante válida.
  - sin `regionId` en config → llama `/store/regions`, usa la primera y cachea.
  - variante sin `calculated_price` se omite; producto sin variantes válidas se
    descarta.
  - disponibilidad por inventario/backorder/manage_inventory.
  - header `x-publishable-api-key` presente en las requests.
  - error de red / no-2xx / JSON inválido → `[]` (search) y `null` (get).
- Render del selector curado: cambio de proveedor reajusta modelo; modelo
  desconocido cae en "Personalizado…". (test de componente acorde a lo que ya
  exista para `_form.tsx`).

## Riesgos / notas

- **Unidad de precio Medusa v2:** se asume `calculated_amount` ya en unidad
  mayor para COP (sin decimales). Verificar contra datos reales en la prueba
  en vivo; si viniera en otra escala, ajustar el factor en un único punto del
  mapeo.
- **`q` en Medusa** hace match sobre título/descripción; suficiente para el
  agente. No se añade búsqueda semántica (eso ya lo cubre RAG aparte).
- El conector es **solo lectura**; los pedidos siguen creándose en el store
  interno de Lula.
