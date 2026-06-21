# Agente IA — Plan E: Catálogo + pedidos (modular) (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Dar al agente la capacidad de **buscar productos y crear pedidos**, con una **abstracción `CatalogProvider`** modular: catálogo **interno** (gestionado en Lula), **externo** (API del cliente) y **Shopify** — los tres como providers enchufables. Los pedidos quedan con campo para comprobante de pago (lo usa la fase de pagos).

**Architecture:** Igual filosofía que CalendarProvider. `CatalogProvider` { search, get }. Impls: `internal` (tabla `products` de Lula), `http` (endpoint configurable), `shopify` (Storefront API). `getCatalogProvider` selecciona por config de org (`agent_catalog`, credenciales cifradas). Tools `buscar_producto`/`crear_pedido` provider-agnósticas. Panel: sección Productos (elegir provider + gestionar catálogo interno o configurar credenciales).

**Tech Stack:** TS, Drizzle(sqlite), Vitest. Reusa: `crypto/encrypt`, patrón calendar (Plan D), `calcular_total` para cotizar.

**Decisión (Luis):** "todo de una" — los 3 catálogos. Pedidos con comprobante (imagen) listo para fase de pagos.

---

## File Structure
- `src/lib/db/schema/domain.ts` (MOD) — tablas `products`, `orders`, `agentCatalog`.
- `src/lib/agent/integrations/catalog/types.ts` — `CatalogProvider`, `Product`.
- `src/lib/agent/integrations/catalog/{internal,http,shopify}.ts` — impls.
- `src/lib/agent/integrations/catalog/index.ts` — `getCatalogProvider`.
- `src/lib/agent/integrations/catalog/config.ts` — get/save config cifrada.
- `src/lib/agent/catalog/orders.ts` — `createOrder` (puro, testeable).
- `src/lib/agent/tools/builtin/{buscar-producto,crear-pedido}.ts` + registro en `registry.ts`.
- `src/lib/agent/admin.ts` (MOD) — helpers de productos (CRUD interno) + saveCatalog.
- Panel `_catalog.tsx` + `_products.tsx` (gestión interna) + acciones + render en `page.tsx`.

---

### Task 1: Schema — products, orders, agent_catalog

**Files:** Modify `src/lib/db/schema/domain.ts` (tras `agentCalendar`).

- [ ] **Step 1:** Añadir:
```ts
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCop: integer("price_cop").notNull().default(0),
    description: text("description"),
    sku: text("sku"),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("products_org_idx").on(t.orgId) }),
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    itemsJson: text("items_json").notNull().default("[]"),
    totalCop: integer("total_cop").notNull().default(0),
    status: text("status", {
      enum: ["pendiente", "confirmado", "pagado", "cancelado"],
    })
      .notNull()
      .default("pendiente"),
    paymentMethod: text("payment_method"),
    comprobanteMediaId: text("comprobante_media_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("orders_org_idx").on(t.orgId, t.createdAt) }),
);

export const agentCatalog = sqliteTable("agent_catalog", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["internal", "http", "shopify"] })
    .notNull()
    .default("internal"),
  credentialsEnc: text("credentials_enc"),
  configJson: text("config_json").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```
- [ ] **Step 2:** `bun run db:generate` → 0017. `bun run db:migrate`. `bunx tsc --noEmit` clean. Verifica que 0017 solo crea estas 3 tablas (si drizzle regenera de más, edítalo para que sea solo lo nuevo) y que `bun run test src/lib/db` o un migrate fresco (DATABASE_URL temporal) aplica limpio.
- [ ] **Step 3: commit** `git add src/lib/db/schema/domain.ts drizzle/migrations && git commit -m "feat(agent): schema products/orders/agent_catalog"`

---

### Task 2: Tipos `CatalogProvider`

**Files:** Create `src/lib/agent/integrations/catalog/types.ts`.
```ts
export type Product = {
  id: string;
  name: string;
  priceCop: number;
  description?: string | null;
  available: boolean;
};

export interface CatalogProvider {
  search(input: { query: string; limit?: number }): Promise<Product[]>;
  get(id: string): Promise<Product | null>;
}
```
- [ ] tsc clean. **commit** `git commit -am "feat(agent): interfaz CatalogProvider (modular)"`

---

### Task 3: Provider interno (tabla products) + test

**Files:** `internal.ts` + test. `makeInternalCatalog(db, orgId): CatalogProvider`. `search`: `LIKE` por nombre (case-insensitive) en `products` de la org, `available=true`, limit (default 10). `get`: por id+orgId.
- [ ] TDD: sembrar org + 2 productos, search "cerv" devuelve el que matchea; get por id. tsc + test verde. **commit** `git commit -am "feat(agent): catálogo interno (tabla products)"`

---

### Task 4: Provider HTTP externo + test

**Files:** `http.ts` + test. `makeHttpCatalog(cfg: { url: string; apiKey?: string; mapping?: {...} }): CatalogProvider`. `search`: GET `${url}?q=${query}` con auth opcional; mapea la respuesta JSON a `Product[]` (campos configurables: nameField, priceField, idField — con defaults name/price/id). `get`: GET `${url}/${id}` o filtra. Timeout 8s, sin secretos en logs. Mock `fetch` en test.
- [ ] TDD + tsc. **commit** `git commit -am "feat(agent): catálogo externo HTTP (configurable)"`

---

### Task 5: Provider Shopify + test

**Files:** `shopify.ts` + test. **VERIFICAR Shopify Storefront API** (GraphQL `https://<shop>.myshopify.com/api/2024-10/graphql.json`, header `X-Shopify-Storefront-Access-Token`). `makeShopifyCatalog(cfg: { shop: string; storefrontToken: string }): CatalogProvider`. `search`: GraphQL `products(first, query)` → map a `Product[]` (price = variantes[0].price * 100 a COP entero — Shopify devuelve decimal; convertir). `get`: `product(id)`. Mock `fetch` con la forma REAL verificada de la respuesta GraphQL.
- [ ] VERIFICAR la API (Context7/docs) + TDD + tsc. **commit** `git commit -am "feat(agent): catálogo Shopify (Storefront API)"`

---

### Task 6: Selector + config cifrada

**Files:** `index.ts` (`getCatalogProvider`) + `config.ts` (get/save) + tests.
- `getCatalogProvider({ provider, db, orgId, credentials, config })` → internal usa db+orgId; http/shopify usan credentials+config. Switch exhaustivo.
- `config.ts`: `saveCatalogConfig(db, orgId, { provider, credentials, config })` cifra credentials (JSON) con `encrypt`; `getCatalogConfig(db, orgId)` descifra → `{ provider, credentials, config } | null` (internal puede no tener credentials).
- [ ] TDD (incl. que la credencial no quede en claro) + tsc. **commit** `git commit -am "feat(agent): getCatalogProvider + config de catálogo cifrada"`

---

### Task 7: `createOrder` (lógica pura) + test

**Files:** `src/lib/agent/catalog/orders.ts` + test. `createOrder(db, { orgId, conversationId, contactId, items: {productId, cantidad}[] }, provider)`: resuelve cada producto vía `provider.get`, calcula `totalCop = Σ price*cantidad`, inserta `orders` (status pendiente, itemsJson con nombre+precio congelados), devuelve `{ orderId, totalCop, items }`. Producto inexistente → error claro.
- [ ] TDD (con provider falso) + tsc. **commit** `git commit -am "feat(agent): createOrder (resuelve productos, congela precios, crea pedido)"`

---

### Task 8: Tools `buscar_producto` y `crear_pedido`

**Files:** 2 tools + tests; registrar en `registry.ts` `BUILTIN_TOOLS`.
- `buscar_producto({ query })`: carga `getCatalogConfig`, construye provider, `search` → `{ ok:true, data:{ productos } }` (máx 10). Sin catálogo → ok:false.
- `crear_pedido({ items:[{productId, cantidad}] })`: provider + `createOrder` (usa ctx.conversationId, contacto vía conversación) → `{ ok:true, data:{ orderId, totalCop } }`.
- [ ] TDD (fetch/provider mock) + tsc + lint. **commit** `git commit -am "feat(agent): tools buscar_producto y crear_pedido"`

---

### Task 9: Panel — Productos (config provider + CRUD interno)

**Files:** admin helpers (`saveCatalog`, `addProduct`, `deleteProduct`, `listProducts`) + actions + `_catalog.tsx` (elegir provider + credenciales http/shopify) + `_products.tsx` (CRUD interno: lista + agregar/eliminar) + render en `page.tsx` (solo muestra CRUD si provider=internal).
- [ ] helpers con tests (addProduct valida precio≥0; saveCatalog valida provider). UI client con acciones. tsc + lint + build (`/configuracion/agente` compila). **commit** `git commit -am "feat(agent): panel — sección Productos (provider + catálogo interno)"`

---

### Task 10: Gauntlet
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` verde.

---

## Self-Review
- Modularidad: `CatalogProvider` + selector aíslan interno/http/shopify; añadir otro = nueva impl + caso. Tools/runtime no cambian.
- Pedidos: precios congelados al crear (no cambian si el catálogo cambia). `comprobanteMediaId` listo para fase de pagos (imagen).
- Seguridad: credenciales http/shopify cifradas, nunca al cliente ni a logs.
- Riesgo: Shopify Storefront API (Task 5) debe verificarse (forma GraphQL real). HTTP catalog mapping flexible.
- Multi-tenant: todo por orgId.

## Siguiente
Plan F (medios de pago manuales: Nequi/Daviplata/Bre-B/transferencia/link abierto, **con comprobante imagen**), G (pasarela EfiPay), H (Flow de pago).
