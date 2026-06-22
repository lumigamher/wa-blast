# Spec: Catálogo interno — búsqueda + disponibilidades + carga masiva XLSX

**Fecha:** 2026-06-22
**Estado:** diseño aprobado — pendiente escribir plan + construir.
**Sub-proyecto:** mejora del catálogo interno del Agente IA (ver `project_wa_blast_agente_ia`).

## Contexto

El catálogo interno (provider `internal`, tabla `products` + `product_variants` + `product_images`) hoy se administra en la página `/configuracion/agente/catalogo` (componente `AgentProducts` en `_products.tsx`). Limitaciones actuales:
- `listProducts(db, orgId)` trae **todos** los productos sin búsqueda ni paginación; la página carga además variantes+imágenes de **todos** (no escala a cientos).
- La disponibilidad (`products.available`, `product_variants.available`) solo se cambia entrando al detalle ("Editar") de cada producto; no hay toggle rápido ni masivo.
- No hay carga masiva: cada producto se agrega a mano.

Ya existe en el repo un **patrón de importación masiva** (Contactos: `src/lib/contacts/import.ts` con SheetJS `XLSX.read`/`sheet_to_json`, y la página `/contactos/import` como wizard subir→mapear→revisar→confirmar con upsert de duplicados). La dependencia **`xlsx` (SheetJS) ya está instalada**.

## Objetivo / No-objetivo

**Objetivo (v1):** en el catálogo interno —
1. **Búsqueda + paginación** de productos (por nombre/SKU), server-side.
2. **Disponibilidad**: toggle rápido disponible/agotado por fila + selección múltiple para marcar en lote.
3. **Carga masiva XLSX**: subir un Excel con productos y variantes, validar y previsualizar, y hacer **upsert por SKU** (producto) / por etiqueta (variante), con plantilla descargable.

**No-objetivo (v1):** imágenes por XLSX, stock numérico/inventario, índice único de SKU en BD, importación de provider HTTP/Shopify (esto es solo catálogo interno).

## Decisiones (confirmadas con Luis 2026-06-22)

1. **Disponibilidad = toggle** disponible/agotado (por fila + masivo). NO stock numérico (eso sería fase 2 aparte).
2. **XLSX = upsert por SKU + variantes en el mismo archivo.** Producto se identifica/actualiza por `(orgId, sku)`; variante por `(productId, etiqueta)`.
3. **Búsqueda + paginación server-side** (no client-side), 20 por página; variantes+imágenes se cargan **solo de la página visible**.
4. **Sin migración**: se usan los campos existentes (`sku`, `available`, variantes). Upsert por consulta select-then-insert/update (sin índice único nuevo, para no arriesgar la migración con SKUs duplicados previos).

## Arquitectura

### Capa de datos (`src/lib/agent/admin.ts` + `catalog/`)
- `listProducts(db, orgId, opts?: { search?: string; limit?: number; offset?: number })` — filtra por `name LIKE %q%` OR `sku LIKE %q%` (case-insensitive), `ORDER BY name`, con `limit`/`offset`. Default sin opts = comportamiento actual (compat).
- `countProducts(db, orgId, opts?: { search?: string })` — total para la paginación.
- `setProductAvailable(db, orgId, id, available: boolean)`.
- `setProductsAvailable(db, orgId, ids: string[], available: boolean)` — lote, scoped por org.
- `upsertProductBySku(db, orgId, { name, priceCop, sku, description?, available? }) → { id, action: "created"|"updated" }` — si `(orgId, sku)` existe, actualiza name/price/description/available; si no, crea. Si `sku` viene vacío → siempre crea (no se puede upsert sin clave).
- `upsertVariant(db, orgId, productId, { label, priceCop?, sku?, available? }) → { id, action }` — upsert por `(productId, label)`.

### Importación (`src/lib/agent/catalog/import.ts`, espejo de `contacts/import.ts`)
- `type ProductImportRow` — fila normalizada del XLSX.
- `parseProductsFile(file: File): Promise<{ headers: string[]; rows: Record<string,string>[] }>` — `XLSX.read` + `sheet_to_json` (igual que `parseContactsFile`).
- `validateProductRows(rows): { valid: ValidProductRow[]; invalid: { row: number; error: string }[]; productCount; variantCount }` — pura, testeable. Reglas: `nombre` requerido en filas de producto base; `precio` numérico ≥ 0; fila con `variante` requiere un `sku` de producto al que colgar; agrupar por `sku`.
- `bulkImportProducts(db, orgId, valid): Promise<{ productsCreated; productsUpdated; variantsCreated; variantsUpdated }>` — agrupa por `sku`, hace `upsertProductBySku` y luego `upsertVariant` por cada variante de ese SKU. En **transacción** (better-sqlite3 soporta `db.transaction`).
- Columnas del XLSX (encabezados, español, case-insensitive):
  - Producto: `nombre`, `precio`, `sku`, `descripcion`, `disponible` (sí/no/true/false/1/0).
  - Variante (opcional por fila): `variante` (etiqueta, ej. "Talla L"), `precio_variante`, `sku_variante`, `disponible_variante`.
  - Semántica: filas con el mismo `sku` pertenecen al mismo producto; el producto se arma con los campos de producto (de cualquier fila del grupo, se toma la primera no vacía); cada fila con `variante` no vacía agrega/actualiza una variante.
- `buildProductsTemplate(): ArrayBuffer` — genera un XLSX de ejemplo con los encabezados + 1-2 filas demo (vía `XLSX.utils`), para el botón "Descargar plantilla".

### UI
- `_products.tsx` (refactor acotado):
  - **Búsqueda**: input que actualiza `?q=` (debounced, `router.replace`). La página es server component → lee `searchParams`.
  - **Paginación**: controles prev/next sobre `?page=`, mostrando "X–Y de N".
  - **Toggle disponibilidad** por fila (botón, patrón del toggle de `_payments.tsx`) → `setProductAvailableAction`.
  - **Selección múltiple**: checkbox por fila + barra de acciones ("Marcar disponibles / agotados") → `setProductsAvailableAction`.
- `catalogo/page.tsx`: leer `searchParams` (`q`, `page`), llamar `listProducts(...{search,limit:20,offset})` + `countProducts`, cargar variantes+imágenes solo de esos ≤20, pasar `total`/`page`/`q` a `AgentProducts`.
- Sub-página **`/configuracion/agente/catalogo/importar`** (espejo de `/contactos/import`): wizard
  1. Descargar plantilla / subir archivo (`parseProductsFile`).
  2. Previsualizar: tabla de filas válidas + lista de inválidas (con fila y motivo) + conteo "X productos / Y variantes".
  3. Confirmar → server action `importProductsAction` → `bulkImportProducts` → toast con el resumen + `router.refresh()`.
  - Botón "Importar XLSX" en la página Catálogo que enlaza a esta sub-página.

### Acciones (`catalogo/.../actions.ts` o el `actions.ts` del agente)
- `setProductAvailableAction(id, available)`, `setProductsAvailableAction(ids, available)`, `importProductsAction(rows)` — todas `requireOrg()` + `revalidatePath("/configuracion/agente/catalogo")`.

## Determinismo / seguridad / testing
- `validateProductRows`, `buildProductsTemplate`, `upsertProductBySku`/`upsertVariant` agrupación: **puros/testeables**, sin red.
- Multi-tenant: toda consulta/upsert scoped por `orgId`; `setProductsAvailable` filtra `ids` dentro de la org; `bulkImportProducts` solo toca productos de la org.
- Parseo XLSX robusto: archivos grandes con tope de filas (p. ej. 2.000) + tamaño máx; encabezados desconocidos se ignoran; celdas vacías → null.
- Tests:
  - `listProducts` con search/limit/offset + `countProducts` (filtra por nombre y SKU, pagina).
  - `setProductAvailable` / `setProductsAvailable` (toggle, lote, scoping org).
  - `upsertProductBySku` (crea / actualiza por SKU; sin SKU → crea) + `upsertVariant` (por etiqueta).
  - `parseProductsFile` (XLSX → rows) y `validateProductRows` (válidas/inválidas, agrupación por SKU, variante sin producto).
  - `bulkImportProducts` end-to-end con un workbook sembrado (productos + variantes, creados vs actualizados).

## Plan de fases (para writing-plans)
1. Data: `listProducts`(search/paginación)+`countProducts`+`setProductAvailable`/`setProductsAvailable`+`upsertProductBySku`/`upsertVariant` (+ tests).
2. Import core: `parseProductsFile`+`validateProductRows`+`bulkImportProducts`+`buildProductsTemplate` (+ tests).
3. UI lista: búsqueda + paginación + toggle + selección múltiple en `_products.tsx` y `catalogo/page.tsx`.
4. UI import: sub-página `catalogo/importar` (wizard) + plantilla descargable + acción.
5. Gauntlet + review + merge + deploy.

## Riesgos / notas
- La página Catálogo hoy carga variantes+imágenes de todos los productos; con paginación a 20 esto deja de ser problema (no se refactoriza a lazy-load del detalle en v1).
- Upsert sin índice único: si hay SKUs duplicados previos en una org, el upsert actualiza el primero que matchea — aceptable v1; un índice único `(orgId, sku)` es fast-follow (requiere limpiar dups antes).
- Compatibilidad: `listProducts` sin opts debe seguir devolviendo todo (lo usan otros callers como el catálogo del agente en runtime). Verificar callers antes de cambiar la firma (añadir opts opcional, no romper).
