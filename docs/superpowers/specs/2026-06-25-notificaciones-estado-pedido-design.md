# Notificaciones de cambio de estado del pedido (plantillas + presets) — Diseño (PENDIENTE DE APROBACIÓN)

**Fecha:** 2026-06-25
**Proyecto:** Lula (wa-blast) — agente IA / pedidos
**Estado:** Borrador para aprobación de Luis (la "Pieza C")

## Contexto y motivación

Cuando cambia el estado de un pedido (confirmado / pagado / cancelado), hay que
**avisar al cliente por WhatsApp**. Como el cambio puede ocurrir en cualquier
momento (fuera de la ventana de 24h), **solo se puede con plantillas aprobadas de
Meta**. Por eso: **presets** (la plantilla pre-armada) que con un click se mandan
a aprobar a Meta una vez la cuenta WABA esté conectada; y una vez aprobadas, el
sistema las envía automáticamente en cada cambio de estado.

Hechos verificados:
- `orders.status` enum `pendiente|confirmado|pagado|cancelado`; `updateOrderStatus(db,orgId,id,status)` (panel `/pedidos`) + EfiPay auto (`markOrderPaidByCheckout`).
- `meta/graph.ts`: `createTemplate(creds, ...)` (POST `/{wabaId}/message_templates` = enviar a aprobar) y `listTemplates` (lee name/status/category). Las campañas ya envían plantillas (hay mecanismo de envío de template + mapeo de variables).
- El pedido tiene contacto/teléfono (join) → destinatario.

## Decisiones (de la conversación)

- **Estados que notifican:** confirmado, pagado, cancelado (no se agregan
  despachado/entregado).
- **Siempre por plantilla** (no texto), porque el timing es impredecible.
- Si no hay plantilla aprobada para ese estado (o la WABA no está conectada): **no
  envía** (silencioso, sin romper). Queda visible en el panel que falta aprobar.

## Componente 1 — Presets de plantilla por estado

3 presets (uno por estado), definidos en código como datos puros
(`src/lib/agent/order-notifications/presets.ts`): cada preset = `{ key:
"confirmado"|"pagado"|"cancelado", nombrePlantilla, idioma:"es", categoria:
"UTILITY", body, variables }`. Ej:
- **confirmado**: "¡Hola {{1}}! Tu pedido #{{2}} quedó confirmado por un total de
  {{3}}. Pronto coordinamos el pago/envío. ¡Gracias por tu compra!"
- **pagado**: "¡{{1}}, recibimos tu pago del pedido #{{2}} ({{3}})! Ya lo estamos
  preparando. Te avisamos cuando salga."
- **cancelado**: "Hola {{1}}, tu pedido #{{2}} fue cancelado. Si fue un error o
  quieres retomarlo, escríbenos. ¡Estamos para ayudarte!"

Variables mapeadas desde el pedido: `{{1}}`=nombre del cliente, `{{2}}`=#numero,
`{{3}}`=total formateado.

## Componente 2 — Enviar presets a aprobar a Meta (UI + acción)

- Panel: sección "Notificaciones de pedido" (en `/configuracion/agente/pagos` o
  una sub-ruta nueva) que lista los 3 presets con su **estado en Meta** (no creada
  / pendiente / aprobada / rechazada) — comparando `listTemplates` con los nombres
  de los presets.
- Botón **"Enviar a aprobar"** por preset → server action que llama
  `createTemplate(creds, {name, language, category:"UTILITY", components:[body con
  {{1}}{{2}}{{3}} + example]})`. Requiere WABA conectada (creds Meta de la org); si
  no, el botón se deshabilita con aviso "Conecta tu cuenta de Meta primero".
- Reusa el patrón existente de creación/listado de plantillas (template-builder /
  graph.ts).

## Componente 3 — Motor de notificación (al cambiar el estado)

- Capa `src/lib/agent/order-notifications/notify.ts`:
  `notifyOrderStatus(db, orgId, orderId, status)` — busca el preset del estado;
  resuelve la plantilla aprobada en Meta (por nombre, status APPROVED via
  `listTemplates`); si existe, arma las variables desde el pedido (nombre, #numero,
  total) y **envía la plantilla** al teléfono del cliente (reusa el envío de
  template de campañas); registra el envío como mensaje saliente (visible en el
  inbox). Si no hay plantilla aprobada o falta teléfono → no-op (no rompe).
- **Disparadores:** llamar `notifyOrderStatus` desde `updateOrderStatus` (panel)
  y desde el auto-pago de EfiPay (`markOrderPaidByCheckout` → status pagado).
  Idempotencia: registrar en el pedido el último estado notificado para no
  duplicar (`orders.lastNotifiedStatus` o tabla de log) — evitar reenvíos si se
  re-guarda el mismo estado.

## Testing

- presets: shape válido (3 estados, variables correctas).
- notify: con plantilla aprobada → envía con variables correctas al teléfono;
  sin plantilla/sin teléfono → no-op; no duplica si el estado ya se notificó.
- la acción "enviar a aprobar" llama createTemplate con el componente correcto
  (mock de graph).

## Migración y despliegue

Migración aditiva pequeña (`orders.lastNotifiedStatus` para idempotencia). Rama
→ subagentes TDD → review → merge → deploy. Verificación: enviar los 3 presets a
aprobar (cuando la WABA esté conectada), aprobar en Meta, cambiar un pedido de
estado y ver llegar la notificación.

## Preguntas abiertas para Luis (al aprobar)

1. ¿El texto de los 3 presets te sirve así, o querés ajustar el copy?
2. ¿Dónde prefieres el panel: dentro de `/configuracion/agente/pagos` o una
   ruta nueva "Notificaciones"?
3. ¿Notificar también "confirmado" (lo setea el vendedor en el panel) o solo
   pagado/cancelado? (lo dejé en los 3.)
