# Spec: Vista de pedidos para el vendedor

**Fecha:** 2026-06-22
**Estado:** diseño aprobado — pendiente plan + construir.
**Sub-proyecto:** completa el flujo de venta del Agente IA (ver `project_wa_blast_agente_ia`).

## Contexto

El agente crea pedidos (`orders`: items, total, status pago, método, comprobante, dirección de despacho `shippingAddressJson`, opción de envío `shippingQuoteJson`). **No existe UI de pedidos** — el vendedor no puede ver lo que el agente vendió ni la dirección para despachar. `orders.ts` solo tiene `createOrder`, `getLatestOrderForConversation`, `setOrderShipping`.

## Objetivo / No-objetivo

**Objetivo (v1):** página top-level **"Pedidos"** donde el vendedor: lista los pedidos (cliente, total, estado, ciudad de envío, fecha) con filtro por estado y paginación; abre el detalle (items, dirección de despacho completa, transportadora elegida, comprobante de pago, método); **edita el estado** (pendiente/confirmado/pagado/cancelado) a mano; y **marca despachado** (campo `dispatchedAt`).

**No-objetivo (v1):** crear/editar pedidos a mano, generar guía, exportar, métricas, edición de items. Fast-follow.

## Decisiones (confirmadas con Luis 2026-06-22)

1. **Ver + estados editables** (el vendedor cambia el estado de pago manualmente) **+ marcar despachado** (campo `dispatchedAt` separado del status de pago).
2. Ubicación: página **top-level `/pedidos`** (como Contactos/Inbox), gated módulo **`agente`** (los pedidos solo existen con el agente activo).
3. El "cliente" se muestra resolviendo teléfono (de la conversación) y nombre (del contacto) vía join; el pedido no guarda el teléfono directo.

## Arquitectura

### Schema (mig 0025)
- `orders`: añadir `dispatchedAt: integer("dispatched_at", { mode: "timestamp" })` (nullable). Sin más cambios (el resto ya existe).

### Capa (`src/lib/agent/catalog/orders.ts`)
- `type OrderListItem` = `{ id, totalCop, status, dispatchedAt, createdAt, phone, contactName, shippingCity }` (shippingCity sale de parsear `shippingAddressJson`).
- `listOrders(db, orgId, opts?: { status?; limit?; offset? })` — join a `conversations` (phone) y `contacts` (name), filtro opcional por status, `ORDER BY createdAt DESC`, limit/offset. Devuelve `OrderListItem[]`.
- `countOrders(db, orgId, opts?: { status? })`.
- `getOrder(db, orgId, id)` — la fila completa + phone/contactName resueltos (o null).
- `updateOrderStatus(db, orgId, id, status)` — status ∈ enum; scoped org.
- `setOrderDispatched(db, orgId, id, dispatched: boolean)` — set `dispatchedAt = now | null`; scoped org.

### UI
- `src/app/(app)/pedidos/page.tsx` (server): `requireModuleAccess("agente")` + `requireOrg`, lee `searchParams` (status, page), `listOrders`+`countOrders`, render `<OrdersList>`.
- `src/app/(app)/pedidos/_orders.tsx` (client): tabla con filtro por estado (chips/select) + paginación 20/pág. Cada fila: cliente (nombre o tel), total (COP), badge de estado, ciudad de envío, fecha, badge "Despachado" si aplica. Click → abre detalle.
- `src/app/(app)/pedidos/[id]/page.tsx` (server) + `_detail.tsx` (client): detalle del pedido — items (parse `itemsJson`: nombre/cantidad/subtotal), **dirección de despacho** (parse `shippingAddressJson`: destinatario/tel/depto/ciudad/dirección/barrio/indicaciones), transportadora+precio+días (parse `shippingQuoteJson`), comprobante (`<img src="/api/inbox/media/<comprobanteMediaId>">` si existe), método de pago; **dropdown de estado editable** → `updateOrderStatusAction`; **botón marcar/desmarcar despachado** → `setOrderDispatchedAction`. Toasts sonner + `router.refresh()`.
- Acciones en `src/app/(app)/pedidos/actions.ts`: `updateOrderStatusAction(id, status)`, `setOrderDispatchedAction(id, dispatched)` — `requireOrg` + `revalidatePath`.

### Sidebar (`src/app/(app)/layout.tsx`)
- Añadir item **"Pedidos"** (icon `PackageIcon`/`ShoppingBagIcon`, `module: "agente"`) — como STANDALONE tras Inbox, o en una sección. Añadir `/pedidos` a `MODULE_ROUTES.agente` en `plans.ts` para el gate de ruta.

## Seguridad / testing
- Multi-tenant: toda consulta/update scoped por `orgId`; `getOrder`/`updateOrderStatus`/`setOrderDispatched` filtran org.
- Comprobante servido por la ruta auth-gated `/api/inbox/media/<id>` (img plano, no next/image).
- `updateOrderStatus` valida el status contra el enum.
- Tests:
  - `listOrders`/`countOrders` (filtro status, paginación, join cliente, scoping org).
  - `getOrder` (fila + cliente; otra org → null).
  - `updateOrderStatus` (cambia; status inválido rechazado; scoping).
  - `setOrderDispatched` (set/unset dispatchedAt; scoping).

## Plan de fases
1. Mig 0025 (`dispatchedAt`) + capa `orders.ts` (list/count/get/updateStatus/setDispatched) + tests.
2. Acciones + página lista `/pedidos` + `_orders.tsx`.
3. Página detalle `/pedidos/[id]` + `_detail.tsx` (estado editable + despachado).
4. Sidebar "Pedidos" + gate ruta.
5. Gauntlet + review + merge + deploy.

## Notas
- `shippingAddressJson`/`shippingQuoteJson` pueden ser null (pedidos viejos o sin envío): el detalle lo maneja (muestra "sin dirección" / "sin envío").
- `status` editable a mano puede chocar con el marcado automático de pago (EfiPay `markOrderPaidByCheckout`): es intencional (el vendedor manda); sin lock v1.
