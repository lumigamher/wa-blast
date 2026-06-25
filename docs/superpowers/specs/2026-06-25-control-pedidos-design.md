# Control de pedidos: anti-duplicados + número consecutivo

**Fecha:** 2026-06-25
**Proyecto:** Lula (wa-blast) — agente IA
**Estado:** Diseño aprobado

## Contexto

El agente creó 3 pedidos duplicados para una compra (evidencia: 2 `crear_pedido`
en ~13s con los mismos items $507.000 → 2 pedidos `pendiente` idénticos + uno
viejo). Causa: `createOrder` SIEMPRE inserta un pedido nuevo (no reusa el
pendiente), y no hay numeración → no hay control.

Hechos verificados:
- `createOrder(db, input, provider)` resuelve items + total e inserta SIEMPRE
  (`orders.id = randomUUID()`); retorna `{orderId, totalCop, items}`.
- `getLatestOrderForConversation(db, orgId, conversationId)` devuelve el último
  pedido o null.
- `orders`: id, orgId, conversationId, contactId, itemsJson, totalCop,
  status enum `pendiente|confirmado|pagado|cancelado`, … (sin `numero`).
- `crear_pedido` retorna resumen `{orderId, numeroCorto, items, totalCop,
  siguientePaso}` (numeroCorto = slice del UUID).
- `OrderListItem` / `listOrders` para la lista; `getOrder` para el detalle Rappi.

## Alcance

Dentro: (1) reusar el pedido `pendiente` de la conversación en vez de duplicar;
(2) número consecutivo por org (`orders.numero`) + backfill; (3) usar `#numero`
en la confirmación del agente y en el panel/Rappi. Fuera: edición de items por el
vendedor en el panel, cancelación automática.

## Componente 1 — Anti-duplicados (reusar el pendiente)

En `createOrder`, tras resolver items + `totalCop`:
- Si `input.conversationId` existe, buscar `getLatestOrderForConversation`.
  - Si hay un pedido y su `status === "pendiente"` → **ACTUALIZAR** ese pedido
    (`itemsJson` y `totalCop` reemplazados con lo recién resuelto; conserva su
    `numero`, `id`, etc.) y retornarlo. (El modelo manda el pedido completo →
    reemplazar es correcto y evita acumulación.)
  - Si no hay pedido, o el último está `confirmado/pagado/cancelado` → crear uno
    **nuevo** (compra nueva real).
- Resultado: múltiples `crear_pedido` sobre la misma compra → UN pedido; compras
  repetidas (tras cerrar la anterior) → pedidos nuevos.

## Componente 2 — Número consecutivo por org

- Migración aditiva: `orders.numero` (`integer("numero")`, nullable) +
  **backfill** de los pedidos existentes con `ROW_NUMBER() OVER (PARTITION BY
  org_id ORDER BY created_at)` (SQL en la migración).
- Helper `nextOrderNumber(db, orgId)` = `coalesce(max(numero),0)+1` para la org.
- En `createOrder`, al crear uno NUEVO: `numero = await nextOrderNumber(...)`. Al
  reusar el pendiente: conserva su `numero`.
- (Concurrencia: baja en un store de WhatsApp; aceptable sin lock por ahora.)

## Componente 3 — Usar `#numero`

- `CreateOrderResult` gana `numero: number`. `crear_pedido` lo expone en su
  resumen (`numero`), y la confirmación del agente dice "Pedido #N". (Se mantiene
  `numeroCorto` por compat, pero el principal es `numero`.)
- `OrderListItem` gana `numero`; `listOrders` lo selecciona; la lista Rappi y el
  detalle muestran **#N** en vez del slice del UUID.

## Testing

- `createOrder`: 2 llamadas seguidas con la misma conversación pendiente → 1 solo
  pedido (el segundo actualiza items/total, mismo id+numero); si el último está
  `pagado`, una nueva llamada crea otro con `numero+1`; sin conversationId crea
  normal.
- `nextOrderNumber`: por org, consecutivo, ignora otras orgs.
- backfill: tras migrar, los pedidos existentes tienen números 1..N por org.
- `crear_pedido` retorna `numero`; `listOrders` incluye `numero`.

## Migración y despliegue

Migración aditiva (`orders.numero` + backfill SQL). Rama `feat/control-pedidos`
→ subagentes TDD → review → merge → deploy. Verificación en vivo: en el test org,
pedir lo mismo 2 veces seguidas → 1 pedido; ver `#N` consecutivo en `/pedidos`.

## Riesgos / notas

- Reemplazar items al reusar: si el modelo mandara solo el item nuevo (no el
  pedido completo), se perdería lo anterior. Mitigación: la descripción de
  `crear_pedido` ya pide los productos confirmados; el modelo manda la lista
  completa. (Si en pruebas se ve que manda parcial, se cambia a merge.)
- Backfill: usar `ROW_NUMBER` por org ordenado por `created_at`; no rompe nada
  (los `numero` previos eran null).
