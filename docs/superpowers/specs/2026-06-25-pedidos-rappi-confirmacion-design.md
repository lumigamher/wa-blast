# Vista de pedidos estilo Rappi (maestro-detalle) + confirmación de pedido al cliente

**Fecha:** 2026-06-25
**Proyecto:** Lula (wa-blast) — agente IA / inbox
**Estado:** Diseño aprobado

## Contexto

Dos mejoras al flujo de pedidos (la tercera pieza —notificaciones por estado con
plantillas/presets— va en un spec aparte después):

- **A:** el agente crea el pedido (`crear_pedido`) pero NO siempre le confirma al
  cliente. Hoy el tool devuelve solo `{orderId, totalCop}` (mínimo), así que el
  modelo no relaya un resumen claro.
- **B:** la vista `/pedidos` son dos rutas separadas (`page.tsx` lista +
  `[id]/page.tsx` detalle); Luis la quiere **estilo Rappi**: lista a la izquierda,
  al hacer click un elemento, el detalle aparece a la derecha con **toda la
  información suministrada por el cliente**, sin recargar la lista.

Hechos verificados:
- `/pedidos`: `page.tsx`, `_orders.tsx` (lista), `[id]/page.tsx`,
  `[id]/_detail.tsx` (detalle con info), `actions.ts` (updateOrderStatus,
  setDispatched).
- `orders`: items_json (con variante), total_cop, status enum
  `pendiente|confirmado|pagado|cancelado`, payment_method, comprobante_media_id,
  shipping_address_json, shipping_quote_json, dispatched_at; contacto vía join.
- `crear-pedido.ts` devuelve `{ ok:true, data:{ orderId, totalCop } }`.
- Patrón maestro-detalle ya implementado en el inbox (parallel routes
  `@list`/`@detail` + `InboxShell` + `AppContent` full-bleed por ruta).

## Alcance

Dentro: A (confirmación de pedido) + B (vista Rappi maestro-detalle). Fuera:
notificaciones por cambio de estado y presets de plantillas (spec C aparte),
nuevos estados de pedido (se mantienen los 4 actuales).

## A — Confirmación de pedido al cliente

**`src/lib/agent/tools/builtin/crear-pedido.ts`:**
- Enriquecer el `result` de éxito a un resumen listo para confirmar:
  `{ ok:true, data:{ orderId, numeroCorto, items:[{nombre, variante?, cantidad,
  subtotalCop}], totalCop, siguientePaso } }` donde `numeroCorto` = los últimos
  6–8 chars del orderId en mayúscula (legible), `siguientePaso` un texto corto
  según el contexto (ej. "coordinar pago" / "coordinar envío").
- Ampliar la `description` del tool: "…Tras crearlo, **confírmale al cliente** el
  número de pedido, el resumen y el total, y dile el siguiente paso (pago o
  envío)."

**Persona de ventas por defecto** (el `PRESETS.ventas` en
`configuracion/agente/_form.tsx` y/o la persona que dejamos en la org de prueba):
añadir la regla "Cuando crees un pedido, confírmaselo SIEMPRE al cliente: número,
resumen, total y el siguiente paso." (Refuerza el comportamiento; el modelo ya
recibe el resumen del tool.)

Resultado: el agente siempre confirma el pedido con datos concretos.

## B — `/pedidos` estilo Rappi (maestro-detalle persistente)

Reestructura a parallel routes (mismo patrón que el inbox):

- `src/app/(app)/pedidos/layout.tsx` (nuevo): shell de 2 paneles que renderiza
  los slots `list` + `detail`. Reusa/clona el patrón de `InboxShell` (client,
  `usePathname`: en móvil un panel a la vez + "←"); lista ~`360–400px`, detalle
  `flex-1`.
- `src/app/(app)/pedidos/@list/default.tsx` (nuevo): renderiza un
  `OrdersListPane` CLIENTE.
- `src/app/(app)/pedidos/@detail/default.tsx` (nuevo): estado vacío
  ("Selecciona un pedido").
- `src/app/(app)/pedidos/@detail/[id]/page.tsx`: el detalle actual (`_detail.tsx`)
  movido aquí, mostrando **toda la info del cliente**.
- `src/app/(app)/pedidos/{page,default}.tsx`: `return null` (contenido en slots).

**`OrdersListPane`** (`src/app/(app)/pedidos/_components/orders-list-pane.tsx`,
client): lee filtro de estado de `useSearchParams` (`?status=`), trae datos por
server action `getOrdersData({ status? })` (reusa `listOrders`/`countOrders` de
`orders.ts`), refetch sólo al cambiar el filtro (no al abrir un pedido). Cada
fila: `<Link href={\`/pedidos/${o.id}\`}>` con cliente (nombre/tel), total
formateado, **badge de estado** (color por estado), ciudad y fecha; fila activa
resaltada con `usePathname`. Filtro de estado como segmented/dropdown sobrio
(iconos lucide, sin emojis). Mantiene su scroll (no se desmonta).

**Detalle** (`@detail/[id]/page.tsx`): muestra TODO lo que dio el cliente:
- Cliente: nombre + teléfono (+ link al chat si hay conversationId).
- Items: cada uno con nombre, **variante** (talla/color), cantidad, precio.
- Total.
- Método de pago + **comprobante** (imagen vía `/api/inbox/media/<id>`).
- **Dirección de envío completa** (todos los campos de `shipping_address_json`:
  dirección, ciudad, barrio, referencias, etc.) + cotización
  (`shipping_quote_json`: transportadora, precio, días).
- Estado: dropdown (`updateOrderStatus`) + toggle despachado (`setDispatched`).
  (Reusa `actions.ts`; `safeParse` tolerante de los JSON como hoy.)

**Full-bleed:** extender `src/app/(app)/_components/app-content.tsx` para que la
condición de full-bleed incluya también `/pedidos` (hoy sólo `/inbox`).

## Testing

- A: test del `result` de `crear_pedido` (incluye numeroCorto, items con
  variante, total, siguientePaso) — `bunx vitest run`.
- B: la capa de datos (`listOrders`/`getOrder`) ya está cubierta; la estructura
  parallel-routes + full-bleed se valida con `bun run build` + verificación en
  vivo (abrir pedidos sin recargar la lista; toda la info visible; filtros).

## Migración y despliegue

Sin migración (no cambia el schema). Rama
`feat/pedidos-rappi-confirmacion` → subagentes TDD → review → merge → deploy.
Verificación en vivo en la org de prueba 49644ae3.

## Riesgos / notas

- **Parallel routes** (gotcha aprendido en el inbox): el `layout` renderiza sólo
  `list`/`detail` (no `children`); `@list` usa `default.tsx`; hace falta
  `pedidos/default.tsx` para el children slot de `/pedidos/[id]`. NO duplicar los
  `_components` del detalle (moverlos, no copiarlos). Cuidar que subagentes no
  escapen los `(app)` de las rutas.
- El detalle pesado actual (`_detail.tsx`) se MUEVE intacto a `@detail/[id]`.
- Sin emojis en UI (iconos lucide); badge de estado con colores sobrios.
