# WhatsApp Calling — Fase 3: Llamadas salientes (diseño)

Fecha: 2026-06-16
Proyecto: wa-blast (Lula)
Estado: aprobado, pendiente de plan de implementación

## Objetivo

Que un agente humano **inicie** una llamada de WhatsApp a un contacto desde la
app, con audio real (WebRTC navegador↔Meta). Incluye todo el ciclo de
**permiso de llamada** que Meta exige para business-initiated calls.

Decisiones de brainstorming:
- Puntos de inicio: botón "Llamar" en (a) header del hilo del inbox, (b) ficha
  de contacto `/contactos/[id]`, (c) "Nueva llamada" en `/llamadas`.
- Permiso ausente → **pedirlo automáticamente** y avisar; cuando llega el
  ACCEPT, se habilita "Llamar" (NO se marca la llamada sola después).
- La llamada activa (audio/mute/colgar/cronómetro/grabación) **reutiliza
  `CallPanel`/`CallSession` de Fase 2** sin cambios funcionales.

## Mecanismo de Meta (verificado)

- **Permiso obligatorio**: una business-initiated call requiere permiso del
  usuario. Se solicita con un mensaje interactivo `call_permission_request`
  (`POST /{phoneId}/messages`), **solo enviable dentro de una ventana de 24h
  abierta** (el contacto escribió hace <24h).
- **Respuesta de permiso** (webhook): el usuario acepta (temporal 7 días o
  permanente) o rechaza; llega un evento de respuesta con `response`
  (`accept`/`reject`) y un `expiration_timestamp`. Si no responde, expira a los
  7 días.
- **Iniciar**: `POST /{phoneId}/calls` con `action: "connect"` (business-
  initiated), enviando el **SDP offer** del negocio en `session`.
- **Answer**: cuando el usuario contesta, el SDP answer llega por webhook
  (sobre el `value.calls[]` del mismo `call id`).

Fuentes: Infobip business-initiated calling, Twilio WhatsApp Business Calling,
Meta Cloud API Calling docs. Los nombres exactos de campos del webhook de
permiso y del answer se verifican contra la doc al implementar (aislados en
`calling.ts` / `webhook.ts`).

## Flujo

1. Agente pulsa **Llamar** (en hilo/ficha/llamadas).
2. Si el contacto **no** tiene permiso vigente (`callPermissionStatus` vacío o
   `callPermissionExpiresAt` pasado) → `requestCallPermissionAction(contactId)`
   envía el mensaje interactivo; UI muestra "Esperando que el contacto acepte".
3. Webhook `call_permission_reply` → `markCallPermission(db, contact, status,
   expiresAt)`; si `accept`, el contacto queda habilitado. El `CallPanel`/la
   vista detectan el cambio (poll/refresh) y avisan + habilitan "Llamar".
4. Con permiso vigente, **Llamar** ahora sí inicia:
   - Navegador: `getUserMedia({audio})` → `RTCPeerConnection` → `createOffer` →
     `setLocalDescription` → esperar ICE complete (no-trickle).
   - `placeCallAction(contactId, offerSdp)`: valida permiso vigente, llama
     `placeCall(settings, offerSdp)` →
     `POST /{phoneId}/calls {action:"connect", session:{sdp, sdp_type:"offer"}}`,
     y CON el `callId` devuelto por Meta crea la fila `calls`
     (`direction:"out"`, `status:"ringing"`, `wacid` = callId). Devuelve `callId`.
   - UI: estado `outgoing` ("Llamando…" + Cancelar).
5. Webhook trae el **answer** del usuario → persiste `answerSdp` en la fila
   `calls` (por `wacid`). El `CallPanel` hace poll de `getCallAnswerAction` y al
   recibirlo hace `session.applyAnswer(sdp)` → `connected`.
6. Activo: audio/mute/colgar(`terminate`)/cronómetro/grabación = Fase 2.
7. **Cancelar** antes de conectar: `terminateCall` + cierre local.

## Componentes y archivos

### Cliente Meta — `src/lib/meta/calling.ts` (modify)

```ts
export function requestCallPermission(s: DecryptedSettings, toPhone: string): Promise<{ ok: true } | { error: string }>;
// POST /{phoneId}/messages { messaging_product:"whatsapp", to, type:"interactive",
//   interactive:{ type:"call_permission_request" } }

export function placeCall(s: DecryptedSettings, offerSdp: string): Promise<{ ok: true; callId: string } | { error: string }>;
// POST /{phoneId}/calls { action:"connect", session:{ sdp: offerSdp, sdp_type:"offer" } }
// (usa GRAPH_CALLS v24; devuelve el id de llamada que Meta asigna)
```

Nota: `placeCall` necesita el `to` del destinatario. Meta lo toma del cuerpo
del `connect` (`to` field) — incluir `to` en el body. Confirmar contra doc.

### Webhook — `src/lib/meta/webhook.ts` + `webhook-handlers.ts` (modify)

- Schema: añadir el bloque de respuesta de permiso (dentro de `messages[]` o un
  campo propio según Meta) y el `session` answer en `calls[]` (ya se parsea
  `session` desde Fase 1; reutilizar).
- `handleCallEvent`: si llega un `connect`/answer para una llamada `out`
  existente con `session.sdp`, persistir `answerSdp`.
- Nuevo `handleCallPermissionReply`: actualiza el contacto vía
  `markCallPermission`.

### Datos — migración 0012

- `contacts`: `callPermissionStatus: text` (null|`temporary`|`permanent`), 
  `callPermissionExpiresAt: integer(timestamp)`.
- `calls`: `answerSdp: text` (el SDP answer del usuario en salientes).

### Store — `src/lib/calls/store.ts` + contactos (modify)

- `markCallPermission(db, orgId, contactId, status, expiresAt)`.
- `getContactCallPermission(db, orgId, contactId)` → `{ status, expiresAt, valid }`
  (`valid` = status permanente, o temporal con `expiresAt > now`).
- `setCallAnswer(db, orgId, callId, sdp)` y `getCallAnswer(db, orgId, callId)`.
- `createOutboundCall(db, {orgId, conversationId, phone, wacid})` → inserta fila
  `out`/`ringing` y devuelve id.

### Cliente WebRTC — `src/app/(app)/_components/call-session.ts` (modify)

- `offer(): Promise<string>` — `createOffer` + `setLocalDescription` + espera
  ICE complete (gemelo de `answer`, simétrico). Reutiliza la grabación/mute/
  hangup existentes.
- `applyAnswer(sdp: string): Promise<void>` — `setRemoteDescription({type:"answer", sdp})`.

### UI

- `src/app/(app)/_components/call-panel.tsx` (modify): estado `outgoing`
  (Llamando…/Cancelar) que hace poll de `getCallAnswerAction(callId)` y aplica
  el answer; al conectar reusa el UI activo. API imperativa para arrancar una
  saliente: un store/contexto ligero o un evento custom (`window`-level) que los
  botones "Llamar" disparan; el `CallPanel` (montado en el layout) lo escucha.
- Botones "Llamar": `inbox/[id]` (header del contacto), `contactos/[id]`
  (ficha), `/llamadas` (Nueva llamada → elegir contacto). Cada botón: consulta
  permiso; si no vigente, pide permiso + muestra estado; si vigente, dispara el
  inicio de llamada en el `CallPanel`.

### Server actions — `src/app/(app)/llamadas/actions.ts` (modify)

`requestCallPermissionAction(contactId)`, `getCallPermissionAction(contactId)`,
`placeCallAction(contactId, offerSdp)` (valida permiso vigente; crea fila;
llama Meta; devuelve `callId`), `getCallAnswerAction(callId)`. Todas con
`requireOrg` + scoping por `orgId`.

## Constraint a reflejar en UI (límite de Meta, no decisión)

La solicitud de permiso solo sale dentro de una **ventana de 24h** abierta. Para
números/contactos sin conversación reciente y sin permiso vigente, "Nueva
llamada" en `/llamadas` no puede pedir permiso → el botón Llamar se deshabilita
con explicación. Solo contactos con conversación <24h o permiso vigente son
llamables.

## Verificación

- **Unit-tests**: `requestCallPermission`/`placeCall` (cuerpos POST, mock
  fetch); parseo del webhook de permiso y del answer; `markCallPermission` +
  `getContactCallPermission` (vigencia/expiración); `setCallAnswer`/`getCallAnswer`;
  `createOutboundCall`. La capa WebRTC del navegador no se unit-testea.
- **Verificación manual** con número de PRODUCCIÓN: pedir permiso → aceptar en
  el teléfono → Llamar → audio bidireccional → colgar → `/llamadas` registra la
  saliente `completed` con duración (+ grabación).
- `bun run lint`, `npx tsc --noEmit | grep ^src/` (limpio), `bun run test`,
  `code-reviewer`, deploy `deploy.sh` (mig 0012).

## Fuera de alcance

- Bot de voz IA, llamadas en grupo, reintentos/colas automáticas.
- Cold-dial a números sin ventana 24h ni permiso (límite de Meta).
- Renovación proactiva del permiso antes de expirar.
