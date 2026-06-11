# wa-blast — SaaS multitenant self-service v1 (diseño)

**Fecha:** 2026-06-10 · **Estado:** aprobado por Luis

## Objetivo

Convertir wa-blast en un SaaS operable en producción: un cliente entra a
`luladev.com`, se registra gratis (se crea su organización), paga la
suscripción con EfiPay y queda activado al instante para enviar. Luis tiene un
panel super admin para operar todo manualmente cuando haga falta.

## Contexto

- Base multi-org ya existente: Better Auth + plugin organization, credenciales
  Meta cifradas AES-GCM por-org en DB, invitaciones de equipo con roles
  (Resend), paridad completa de features (carrusel, flows, auth/OTP, opt-out).
- Nunca desplegado: sin server ni dominio hasta esta fase.
- Decisiones de Luis: server **vps-prod-01 (158.220.123.213)**, dominio
  **luladev.com** (lo apunta él por DNS), pasarela **EfiPay** (tiene cuenta;
  EfiPay sí soporta suscripciones recurrentes), flujo **registro gratis →
  pagar para activar**, **un solo plan mensual** con precio configurable.

## 1 · Registro público y organizaciones

- Signup abierto: **cada registro sin invitación crea su propia org**
  (reemplaza el first-user-wins actual). Invitados de equipo entran a la org
  del invitador, como hoy.
- Org sin suscripción activa = **modo limitado**: puede ver el dashboard,
  configurar credenciales Meta (`/configuracion/meta`) y equipo, pero crear o
  enviar campañas, registrar plantillas en Meta y enviar flows quedan
  **bloqueados server-side en las actions** (no solo UI), con CTA a
  `/facturacion`.

## 2 · Suscripciones con EfiPay

- **Un plan mensual** único; precio en COP editable desde el panel admin
  (default placeholder editable).
- Tabla `subscriptions` por org con `paidUntil` como **fuente de verdad
  interna**: cada cobro confirmado extiende 30 días. Esto desacopla la
  activación de la pasarela y habilita activación manual.
- Vía principal: **suscripción recurrente nativa de EfiPay** (plan + cobro
  automático mensual). El **webhook firmado** de cada cobro extiende
  `paidUntil`; un cobro fallido simplemente deja vencer la fecha (bloqueo
  suave al expirar, con aviso previo en la app).
- Flujo UI: `/facturacion` → suscribirse → checkout hosted EfiPay → página de
  retorno con estado → webhook activa. Idempotencia por id de cargo (un mismo
  pago no extiende doble).
- ⚠️ Credenciales EfiPay: las del VPS infectado en mayo quedaron como
  placeholders pendientes de rotación — Luis entrega las reales (rotadas) al
  desplegar. Verificar en la doc oficial de EfiPay el contrato exacto de
  planes/suscripciones/webhooks antes de implementar (no asumir).

## 3 · Panel super admin (`/admin`)

- Gate por env `ADMIN_EMAILS` (correo de Luis); inaccesible para el resto
  (404, no 403, para no revelar su existencia).
- Funciones: lista de orgs con estado de sub, usuarios y último pago;
  **activar/extender manual** (pagos por transferencia/Nequi); suspender org;
  crear org + invitar dueño; editar precio del plan.

## 4 · Despliegue (vps-prod-01)

- systemd `wa-blast` → Node `next start` en **127.0.0.1:3010** (nunca
  0.0.0.0 — vector de la infección kinsing de mayo).
- Caddy: site `luladev.com` → reverse_proxy 3010, HTTPS automático. Luis
  apunta el A record a 158.220.123.213.
- Datos persistentes **fuera del dir de deploy** (lección el-man): SQLite en
  `/var/lib/wa-blast/data.db` y media en `/var/lib/wa-blast/media`, rutas por
  env. Cron diario de backup del .db.
- Deploy script estilo milujo: `git archive | tar` por SSH (sin `.git`,
  **excluye `.env*`**), build en server, `rm -rf .next/cache`.
- Env producción: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://luladev.com`,
  key AES de settings por-org, `RESEND_API_KEY`, key del generador IA de
  flows, `EFIPAY_*`, `ADMIN_EMAILS`, rutas de datos.
- Con HTTPS quedan funcionales el webhook proxy de Meta y el de EfiPay.

## 5 · Pruebas

- Aislamiento multi-org: usuario de org A no puede leer/escribir datos de
  org B en las queries críticas (plantillas, campañas, contactos, flows,
  settings).
- Gate de suscripción: action bloqueada sin sub, permitida con sub activa,
  bloqueo al expirar `paidUntil`.
- Webhook EfiPay: firma inválida rechazada; idempotencia de cargos.

## Fuera de alcance — roadmap de fases siguientes (decisión Luis 2026-06-10)

La visión de producto es una **solución integral de comunicación WhatsApp**
(no un CRM completo). Orden acordado:

- **Fase 2 — Administrador de mensajes (inbox estilo Chatwoot):** bandeja de
  conversaciones bidireccional por org con las capacidades de Meta
  (texto/media/reacciones/respuestas, ventana 24h, plantillas fuera de
  ventana), multi-agente. Depende de Fase 1: el webhook proxy firmado ya
  existe y con HTTPS empieza a recibir entrantes. Spec propio.
- **Fase 3 — Meta Calling API:** llamadas WhatsApp (WebRTC). Disponibilidad
  limitada de Meta y aprobación por WABA/número — empieza con investigación
  de elegibilidad. Spec propio.
- También fuera de v1: Embedded Signup de Meta, tiers/límites de uso, RSA
  por-org para Flows data-exchange, facturación electrónica.
