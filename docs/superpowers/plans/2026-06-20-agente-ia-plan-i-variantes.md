# Agente IA — Plan I: Variantes + imágenes de producto (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Que los productos del **catálogo interno** tengan **variantes reales** (ej. "Rojo/M", con precio/SKU propios) y **múltiples imágenes etiquetadas** (subidas como archivo O por URL), ligables a una variante. El catálogo (buscar_producto) devuelve variantes + imágenes.

**Architecture:** Tablas `product_variants` y `product_images` (1:N con `products`). Imágenes "ambas": `source="upload"` (reusa `saveMediaAsset` → `mediaAssets`, servida por `/api/inbox/media/[id]`) o `source="url"`. El provider interno enriquece `Product` con variants+images. Panel: gestión por producto.

**Tech Stack:** TS, Drizzle, Vitest. Reusa `src/lib/media/store.ts` (`saveMediaAsset(db,{orgId,bytes,mime})`), tabla `products` (Plan E), `CatalogProvider`/`Product`.

**Decisión (Luis):** variantes reales + imágenes etiquetadas; subir archivos O pegar URL.

---

## File Structure
- `domain.ts` (MOD) — `productVariants`, `productImages`.
- `src/lib/agent/catalog/variants.ts` — CRUD variantes.
- `src/lib/agent/catalog/images.ts` — CRUD imágenes (url + upload) + `imageUrl(row)`.
- `src/lib/agent/integrations/catalog/types.ts` (MOD) + `internal.ts` (MOD) — `Product` con `variants`/`images`.
- `src/app/api/products/[id]/images/route.ts` — upload (POST FormData).
- Panel: `_products.tsx` (MOD) → detalle de producto con variantes + imágenes.

---

### Task 1: Schema `product_variants` + `product_images`
**Files:** `domain.ts` (tras `products`):
```ts
export const productVariants = sqliteTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // ej. "Rojo / M"
    priceCop: integer("price_cop"), // null = usa el precio del producto
    sku: text("sku"),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ prodIdx: index("product_variants_prod_idx").on(t.productId) }),
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    source: text("source", { enum: ["upload", "url"] }).notNull(),
    mediaAssetId: text("media_asset_id"), // si source=upload
    url: text("url"), // si source=url
    label: text("label"), // etiqueta (Rojo, Talla M...)
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ prodIdx: index("product_images_prod_idx").on(t.productId) }),
);
```
- [ ] `db:generate` → 0021 (solo estas 2 tablas; migrate fresco). tsc clean. **commit** `feat(agent): schema product_variants + product_images`

---

### Task 2: Helpers de variantes + imágenes (con tests)
**Files:** `src/lib/agent/catalog/variants.ts` + `images.ts` + tests.

`variants.ts`: `listVariants(db, productId)`, `addVariant(db, orgId, productId, {label, priceCop?, sku?})` (valida label), `deleteVariant(db, orgId, id)`, `setVariantAvailable(db, orgId, id, bool)`.

`images.ts`:
```ts
export function imageUrl(row: { source: string; mediaAssetId: string | null; url: string | null }): string {
  if (row.source === "url" && row.url) return row.url;
  if (row.source === "upload" && row.mediaAssetId) return `/api/inbox/media/${row.mediaAssetId}`;
  return "";
}
export async function listImages(db, productId) {...}
export async function addImageUrl(db, orgId, productId, { url, label?, variantId? }) {...} // source "url"
export async function addImageUpload(db, orgId, productId, { mediaAssetId, label?, variantId? }) {...} // source "upload"
export async function deleteImage(db, orgId, id) {...}
```
- [ ] TDD: addVariant/list/delete/available; addImageUrl + addImageUpload + listImages + imageUrl (devuelve la url correcta por source) + delete. tsc clean. **commit** `feat(agent): helpers de variantes e imágenes de producto`

---

### Task 3: Enriquecer `Product` (variants + images) en el provider interno
**Files:** `types.ts` (MOD) + `internal.ts` (MOD) + test.
- `Product` añade: `variants?: Array<{ id: string; label: string; priceCop: number; sku?: string | null; available: boolean }>`, `images?: Array<{ url: string; label?: string | null; variantId?: string | null }>`.
- `internal.ts` `get`/`search`: tras cargar el producto, cargar sus variantes (priceCop ?? product.priceCop) e imágenes (mapeadas con `imageUrl`). En `search` puede ser N+1 acotado (limit ≤10) — aceptable.
- [ ] TDD: producto con 2 variantes + 2 imágenes (una upload, una url) → `get` devuelve variants + images con urls correctas. tsc + lint. **commit** `feat(agent): catálogo interno devuelve variantes e imágenes`

---

### Task 4: Endpoint de subida de imagen
**Files:** `src/app/api/products/[id]/images/route.ts` (POST).
- `requireOrg()`; valida que el producto sea de la org. Lee `FormData` (`file` + opcional `label`, `variantId`). `const buf = await file.arrayBuffer(); const asset = await saveMediaAsset(db, { orgId, bytes: buf, mime: file.type, kind: "image" }); await addImageUpload(db, orgId, productId, { mediaAssetId: asset.id, label, variantId });` → 200 JSON `{ ok:true, id }`. Límite de tamaño razonable (p.ej. 5MB) → 413 si excede.
- [ ] tsc + lint. **commit** `feat(agent): endpoint de subida de imagen de producto`

---

### Task 5: Panel — gestión de variantes + imágenes por producto
**Files:** admin helpers/actions + `_products.tsx` (MOD) o un `_product-detail.tsx`.
- En la lista de productos del panel, cada producto tiene un botón "Editar" que despliega (Sheet/colapsable): variantes (agregar label+precio+sku, listar, eliminar, toggle disponible) e imágenes (agregar por URL con etiqueta, O subir archivo vía el endpoint con `fetch(FormData)`, listar con preview thumbnail + etiqueta + variante asignada, eliminar).
- Actions: `addVariantAction`, `deleteVariantAction`, `setVariantAvailableAction`, `addImageUrlAction`, `deleteImageAction`. (La subida va por el endpoint POST, no server action.)
- [ ] tsc + lint + build (`/configuracion/agente` compila). **commit** `feat(agent): panel — variantes e imágenes por producto`

---

### Task 6: Gauntlet + merge + deploy
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` verde.

---

## Self-Review
- Imágenes "ambas": `source` distingue upload (mediaAssetId → /api/inbox/media/) y url (externa). `imageUrl()` centraliza.
- Variantes: precio propio opcional (fallback al del producto); ligables a imágenes via `variantId`.
- Multi-tenant: todo por orgId; el endpoint valida producto∈org antes de subir.
- El agente: `buscar_producto` ahora trae variants+images → puede mencionar variantes y (futuro) enviar la foto. Enviar la imagen por WhatsApp = capacidad futura (el agente hoy responde texto; mandar media necesita un side-effect como enviar_checkout).
- Riesgo: N+1 en search (acotado a 10). Tamaño de imagen limitado en el endpoint.

## Siguiente
Que el agente ENVÍE la foto de la variante por WhatsApp (tool con side-effect sendMedia). Luego RAG/documentos.
