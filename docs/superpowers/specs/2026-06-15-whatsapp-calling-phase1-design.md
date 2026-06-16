# WhatsApp Calling — Fase 1 (eventos + configuración) — Design Spec

**Fecha:** 2026-06-15
**Proyecto:** Lula (`wa-blast`)
**Estado:** Aprobado por Luis (diseño). Apegado a la doc de Meta (WhatsApp Business Calling API).

## Objetivo

Primera fase de la integración de **llamadas de WhatsApp** (Calling API). Capturar los **eventos de llamada** vía webhook y mostrarlos (a) **inline en la conversación** del contacto y (b) en una **vista de registro** `/llamadas`; más una **configuración** para habilitar/ajustar el calling del número. **Sin audio** (atender/hacer llamadas con WebRTC = Fases 2 y 3).

Decisión de Luis: meta final = atender y hacer llamadas con audio, **por fases**. Esta es la base.

## Contexto del código (verificado)

- Meta vía Graph API (hoy `v22.0`) en `src/lib/meta/client.ts`. Webhook en `src/app/api/webhook/meta/route.ts` + `src/lib/meta/webhook.ts` (schema zod, hoy parsea `messages`/`statuses`, NO `calls`) + `src/lib/meta/webhook-handlers.ts`.
- Inbox: `getOrCreateConversation(db, orgId, phone, ts, profileName?)` en `src/lib/inbox/store.ts`; el hilo (`thread.tsx`) ya interleava mensajes + notas por `createdAt` (mismo patrón para llamadas).
- Config: `src/app/(app)/configuracion/` con `<ToastForm>` + acciones (`configuracion/actions.ts`).
- Settings de la org en `organization_settings` (creds Meta desencriptadas vía `getOrgSettings`).

## Datos de Meta (doc oficial)

- **Campo de webhook a suscribir:** `calls`.
- **Payload entrante** (`entry[].changes[].value.calls[]`):
  ```json
  { "id": "<call-id>", "from": "1555...", "to": "1234...", "event": "connect",
    "timestamp": "1762216151", "direction": "USER_INITIATED",
    "session": { "sdp": "<offer>", "sdp_type": "offer" } }
  ```
  - `event`: `connect` (llamada entrante con SDP offer) y `terminate` (llamada finalizada). El `terminate` trae estado/duración (nombres EXACTOS de `status`/`duration` a verificar en doc al implementar).
  - `direction`: `USER_INITIATED` (cliente→negocio) | `BUSINESS_INITIATED` (negocio→cliente).
- **Habilitar/configurar calling:** `POST https://graph.facebook.com/v{VER}/{phoneId}/settings` con body `{ "calling": { "status": "ENABLED" | "DISABLED", "call_icon_visibility": ..., "callback_permission_status": ..., "call_hours": {...} } }`. GET del mismo endpoint para leer la config. (VER: usar la versión del app; verificar que calling esté disponible — los ejemplos de Meta usan v23/v24; si v22 no lo soporta, bump aislado.)
- **Acciones de llamada** (Fase 2, NO esta fase): `POST /{phoneId}/calls` con `action` (`pre_accept`/`accept`/`reject`/`terminate`) + `call_id` + SDP answer. Codecs: PCMU/PCMA/OPUS.

## Decisiones de diseño (Fase 1)

### 1. Tabla `calls`
```
id (PK), orgId (FK), conversationId (FK), phone, direction ("in"|"out"),
status ("ringing"|"missed"|"completed"|"rejected"|"failed"), wacid (id de llamada Meta, único por org),
startedAt, endedAt, durationSec (int nullable), createdAt.
```
Índices: `(orgId, createdAt)`, `(conversationId)`, único `(orgId, wacid)`.
- `direction`: mapear `USER_INITIATED`→"in", `BUSINESS_INITIATED`→"out".
- `status`: en `connect` sin respuesta nuestra (Fase 1 no contesta) la llamada termina → `missed` (entrante) ; `terminate` con duración>0 → `completed`; etc. Mapear desde el `event`/`status` de Meta.

### 2. Webhook (`src/lib/meta/webhook.ts` + handler)
- Extender el `value` del schema con `calls: z.array(z.object({ id, from, to, event, timestamp, direction, session: {...}.optional() }).passthrough()).optional()`.
- `route.ts`: por cada `v.calls`, llamar `handleCallEvent(db, orgId, call)`.
- `handleCallEvent` (nuevo, `src/lib/meta/webhook-handlers.ts` o `src/lib/calls/`): `getOrCreateConversation(phone)` + **upsert en `calls` por `(orgId, wacid)`** según el `event`:
  - `connect`: crear registro `ringing` (o `missed` si no se contesta — en Fase 1 nunca contestamos, así que el `terminate` posterior define el estado final).
  - `terminate`: actualizar `status` (completed/missed/rejected/failed según Meta) + `endedAt` + `durationSec`.
  - Best-effort, no romper el webhook (try/catch como el resto).
- Añadir `calls` a las instrucciones de suscripción del webhook (página de config Meta).

### 3. Store `src/lib/calls/store.ts`
- `recordCallEvent(db, {orgId, wacid, phone, direction, event, status?, durationSec?, ts})` — upsert.
- `listCalls(db, orgId, {status?, direction?, q?})` — para la vista de registro (join con contacts para nombre).
- `getCallsForConversation(db, orgId, conversationId)` — para el inline en el hilo.

### 4. Render inline (en el hilo)
- `getThread` devuelve también `calls` de la conversación; `thread.tsx` los interleava por `createdAt` (igual que notas) como una **entrada de llamada**: ícono lucide `PhoneIncomingIcon`/`PhoneMissedIcon`/`PhoneOutgoingIcon` + etiqueta ("Llamada perdida", "Llamada contestada · 2:14", "Llamada saliente") + hora. Estilo system-row centrado/sutil, distinto de las burbujas.

### 5. Vista de registro `/llamadas`
- Ruta nueva en `(app)/llamadas/page.tsx` (entrada en el sidebar, grupo "Inbox" o "Cuenta"). Lista todas las llamadas (filtros estado/dirección/búsqueda por nombre/teléfono), con avatar/nombre/teléfono, estado+ícono, duración, hora (con `<LocalDateTime>`), enlazando a `/inbox/{conversationId}`.

### 6. Configuración `/configuracion/llamadas`
- Página para **habilitar/deshabilitar** el calling del número + ajustes (call_icon_visibility, callback_permission, horarios). Lee config actual (GET settings) y guarda (POST settings) vía un cliente aislado `src/lib/meta/calling.ts` (`getCallingSettings(creds)`, `setCallingSettings(creds, {...})`). Usa `<ToastForm>` + toast. Aislar el contrato Meta aquí para ajustar nombres exactos en un solo lugar.

## Unidades
1. Schema `calls` + migración.
2. `src/lib/meta/calling.ts` — cliente de Call Settings (get/set), aislado.
3. `src/lib/calls/store.ts` — recordCallEvent/listCalls/getCallsForConversation.
4. Webhook: schema `calls` + `handleCallEvent`.
5. `getThread` devuelve calls; `thread.tsx` render inline.
6. `/llamadas` vista de registro.
7. `/configuracion/llamadas` UI de configuración.

## Pruebas
- Unit `handleCallEvent`/store: connect→ringing, terminate→completed con duración, missed, aislamiento por org, upsert por wacid.
- Unit parseo webhook `calls`.
- (UI: verificación con screenshots; los datos reales de llamadas requieren un número con calling habilitado — sembrar registros de prueba para el render.)

## Fuera de alcance (Fase 1)
- Atender llamadas (SDP answer + WebRTC + audio) → **Fase 2**.
- Llamadas salientes iniciadas por el negocio → **Fase 3**.
- Las acciones `pre_accept/accept/reject/terminate` y el stack WebRTC/STUN-TURN se diseñan en el spec de la Fase 2.

## ⚠️ A verificar contra doc Meta al implementar (aislado)
- Nombres exactos del `terminate` (campo de `status` y `duration`).
- Versión de Graph API que habilita calling (¿v22 ok o bump?).
- Forma exacta del body de Call Settings (`call_icon_visibility`, `callback_permission_status`, `call_hours`).
