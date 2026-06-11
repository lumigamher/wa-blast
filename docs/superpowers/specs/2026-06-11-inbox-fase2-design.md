# wa-blast — Fase 2: Inbox de mensajes WhatsApp (diseño)

**Fecha:** 2026-06-11 · **Estado:** diseñado de forma autónoma bajo autorización de Luis
("al finalizar sigue con la fase dos"); los **Supuestos** de abajo son vetables — cambiar
cualquiera solo ajusta la pieza correspondiente.

## Objetivo

Administrador de mensajes bidireccional estilo Chatwoot dentro de wa-blast: cada org ve
sus conversaciones de WhatsApp, lee todo lo que llega (texto, media, respuestas
interactivas) y responde — texto libre dentro de la ventana de 24h, plantilla fuera de
ella. Multi-tenant sobre la infraestructura ya desplegada en luladev.com.

## Contexto

- El webhook `/api/webhook/meta` YA recibe entrantes multi-org (resuelve org por
  `phoneId`, verifica firma HMAC) pero `handleInboundMessage` solo cuenta replies y
  procesa opt-outs — descarta el contenido.
- `handleStatusEvent` YA procesa sent/delivered/read/failed de salientes (campañas).
- Existe `whatsapp-bubble.tsx` (preview de plantillas), media store self-hosted,
  `sendTemplate`/`sendFlow` en `src/lib/meta/client.ts`, creds por-org.

## Supuestos (decisiones tomadas en autonomía)

1. **Polling, no websockets** (refresh cada ~5s en el cliente): un solo proceso Node +
   SQLite; suficiente para v1 y cero infraestructura nueva.
2. **Ver el inbox es libre; ENVIAR exige suscripción activa** (consistente con el modo
   limitado de Fase 1).
3. **v1 envía texto y plantillas.** Enviar media/audio/documentos queda para v2.1
   (recibirlos SÍ se soporta desde v1).
4. **Sin asignación de agentes, notas ni etiquetas de conversación en v1** — todos los
   miembros de la org ven el mismo inbox (Chatwoot-parity completa es iterativo).
5. **Media entrante se descarga bajo demanda** (proxy autenticado con cache en disco),
   no en el webhook — el webhook debe responder rápido a Meta.

## 1 · Datos (2 tablas nuevas)

- `conversations`: id, orgId, phone (unique por org), contactId (nullable → contacts),
  lastMessageAt, lastIncomingAt (ancla de la ventana 24h), unreadCount, createdAt.
- `messages`: id, conversationId, orgId, direction (in|out), wamid (unique, nullable
  para fallidos), type (text|image|video|audio|document|sticker|reaction|interactive|
  button|template|flow|unknown), body (texto o resumen legible), mediaId (id de media
  de Meta, entrantes), status (pending|sent|delivered|read|failed, salientes),
  errorMessage, payloadJson (raw), createdAt. Índices: (conversationId, createdAt),
  (orgId, wamid).

## 2 · Ingesta (webhook)

`handleInboundMessage` se extiende (manteniendo opt-out y reply-count): upsert de la
conversación por (orgId, phone) + insert del mensaje según tipo — texto → body; media →
mediaId + caption como body; interactive/button/nfm_reply → resumen legible en body +
raw en payloadJson; reaction → body con el emoji; tipos desconocidos → type unknown +
raw. Incrementa unreadCount y actualiza lastIncomingAt/lastMessageAt. Vincula contactId
si existe el contacto. `handleStatusEvent` además actualiza `messages.status` por wamid
(sent→delivered→read, failed con errorMessage).

## 3 · Envío

- `sendText(creds, to, body)` nuevo en `src/lib/meta/client.ts`
  (`type:"text"` a `/{phoneId}/messages`).
- Server action `sendMessageAction(conversationId, body)`: requireOrg + gate de
  suscripción + **ventana**: si `lastIncomingAt > now-24h` envía texto; si no, devuelve
  `{windowClosed:true}` y la UI ofrece plantilla. Inserta el mensaje out con status
  pending→sent (wamid de la respuesta) o failed (errorMessage de Meta).
- `sendTemplateToConversationAction(conversationId, templateName, lang, params)`:
  reusa `sendTemplate` (fuera de ventana). Registra mensaje type template.
- `markReadAction(conversationId)`: pone unreadCount=0 y best-effort marca el último
  wamid entrante como leído en Meta (`status:"read"`).

## 4 · Media entrante

Route `GET /api/inbox/media/[mediaId]` (sesión + org): si ya está cacheado en el media
store local lo sirve; si no, `GET graph/{mediaId}` con el token de la org → descarga la
URL temporal de Meta → guarda en media store (orgId) → sirve. Los mensajes de media
renderizan imagen/audio/video/documento apuntando a esa ruta.

## 5 · UI `/inbox` (nav item nuevo, icono MessageSquare)

Dos paneles estilo Chatwoot:
- **Lista** (izq): conversaciones ordenadas por lastMessageAt desc; nombre del contacto
  o teléfono, preview del último mensaje, hora relativa, badge unread. Búsqueda por
  nombre/teléfono. Filtro Todas / No leídas. Polling ~5s.
- **Hilo** (der, `/inbox/[id]`): burbujas in/out (estética WhatsApp, reutilizando
  estilos de whatsapp-bubble), ticks de estado en salientes, media renderizada, scroll
  pegado abajo, marca leído al abrir. **Composer**: textarea + enviar dentro de
  ventana; fuera de ventana, banner "ventana de 24h cerrada" + selector de plantilla
  aprobada (lista de Meta ya disponible) con sus variables.
- Indicador de ventana (chip "Expira en Xh" / "Cerrada").

## 6 · Pruebas

- Ingesta: cada tipo de mensaje crea/actualiza conversación y mensaje correcto
  (payloads reales de Meta como fixtures); unreadCount y lastIncomingAt; opt-out sigue
  funcionando; aislamiento por org.
- Ventana 24h: dentro→texto OK, fuera→windowClosed; gate sin suscripción bloquea envío.
- Status: delivered/read/failed actualizan el mensaje por wamid.
- markRead: resetea unread.

## Fuera de alcance (v2.1+ / Fase 3)

Enviar media, asignación de agentes, notas internas, etiquetas, respuestas rápidas,
websockets/SSE, indicador de escritura, Calling API (Fase 3).
