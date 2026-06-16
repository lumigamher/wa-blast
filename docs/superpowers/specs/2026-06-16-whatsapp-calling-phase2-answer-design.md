# WhatsApp Calling — Fase 2: Atender con audio (diseño)

Fecha: 2026-06-16
Proyecto: wa-blast (Lula)
Estado: aprobado, pendiente de plan de implementación

## Objetivo

Permitir que un **agente humano conteste, en el navegador de Lula, una llamada
entrante de WhatsApp con audio real**, vía WebRTC navegador↔Meta. Incluye:
atender, rechazar, colgar, cronómetro, silenciar micrófono y **grabación**
(client-side). Sin servidor de media.

Decisiones tomadas en brainstorming:
- Quién atiende: **agente humano en la app** (no bot de IA).
- TURN: **coturn self-hosted** en vps-prod-01.
- Controles v1: atender/rechazar, colgar+temporizador, silenciar, grabar.

## Contexto y hallazgo clave

La Fase 1 (+ pulido) ya dejó: tabla `calls`, webhook que parsea
`value.calls[]` y **persiste el SDP offer** en `calls.sdp/sdpType`, vista
`/llamadas`, `IncomingCallPoller` (poll 5s + toast), y config para habilitar
calling.

**Como el offer ya está persistido, NO hace falta un canal de señalización
WebSocket.** La señalización se resuelve con el polling existente (para
descubrir la llamada y leer el offer) + server actions (para mandar el answer),
usando **ICE no-trickle** (el navegador reúne todos los candidatos antes de
enviar el answer, eliminando el intercambio de candidatos en tiempo real).

## Flujo de una llamada entrante

1. **connect** (webhook) → offer persistido en `calls.sdp` (ya ocurre).
2. **Descubrimiento**: `IncomingCallPoller` detecta la llamada `ringing` (ya
   ocurre) → muestra UI entrante con **Atender / Rechazar**.
3. **Atender**:
   - `navigator.mediaDevices.getUserMedia({ audio: true })`.
   - `new RTCPeerConnection({ iceServers })` con `iceServers` traídos del
     server action `getIceServers()` (STUN público + TURN coturn con credencial
     efímera).
   - `setRemoteDescription({ type: "offer", sdp })` con el offer leído del server
     action `getCallOffer(callId)`.
   - `createAnswer()` → `setLocalDescription(answer)`.
   - Esperar a `iceGatheringState === "complete"` (no-trickle) → tomar
     `pc.localDescription.sdp` ya con candidatos.
   - Server action `acceptCall(callId, answerSdp)` →
     `POST /{phoneId}/calls { call_id, action: "accept", session: { sdp, sdp_type: "answer" } }`.
   - `pc.ontrack` → adjuntar el stream remoto a un `<audio autoplay>` oculto.
   - Estado de la llamada → `connected`, `answeredAt = now`.
4. **Silenciar**: `localTrack.enabled = !enabled` (no afecta a Meta, solo corta
   el micrófono local).
5. **Colgar**: `pc.close()` + server action `terminateCall(callId)` →
   `POST /{phoneId}/calls { call_id, action: "terminate" }`. Cronómetro desde
   `answeredAt`.
6. **Rechazar** (sin atender): server action `rejectCall(callId)` →
   `POST /{phoneId}/calls { call_id, action: "reject" }`. Estado → `rejected`.

Los webhooks `terminate` siguen llegando y `recordCallEvent` reconcilia el
estado/duración finales (ya funciona; el estado terminal no revive a ringing).

## Componentes y archivos

### Cliente Meta — `src/lib/meta/calling.ts` (modify)

Versión Graph configurable. Añadir un const/env `META_GRAPH_VERSION`
(default `"v24.0"` para acciones de llamada; los ejemplos de Meta para
accept/reject/terminate usan v24, mientras settings funcionaba en v22). Añadir:

```ts
export async function callAction(
  s: DecryptedSettings,
  body: { call_id: string; action: "accept" | "reject" | "terminate"; session?: { sdp: string; sdp_type: "answer" } },
): Promise<{ ok: true } | { error: string }>;
```

Hace `POST /{metaPhoneId}/calls` con `authorization: Bearer {metaAccessToken}`.
Wrappers finos `acceptCall`/`rejectCall`/`terminateCall` para legibilidad.

### Server actions — `src/app/(app)/llamadas/actions.ts` (modify)

Todas con `requireOrg()` + `getOrgSettings(db, orgId)`:

- `getCallOffer(callId)`: devuelve `{ sdp }` del registro `calls` (valida orgId).
- `getIceServers()`: devuelve `RTCIceServer[]` — STUN público
  (`stun:stun.l.google.com:19302`) + TURN coturn con **credencial efímera**
  (usuario `=${expiryUnix}` y `credential = base64(HMAC-SHA1(secret, usuario))`,
  patrón TURN REST de coturn `use-auth-secret`). Secret e `TURN_URL` por env.
- `acceptCall(callId, answerSdp)`, `rejectCall(callId)`, `terminateCall(callId)`:
  validan orgId, llaman `callAction`, y actualizan el estado local
  (`connected`/`rejected`) vía un helper en el store.

### WebRTC cliente — `src/app/(app)/_components/call-session.ts` (create)

Módulo (no React) que encapsula el ciclo de vida de una `RTCPeerConnection`:
crear, `answer(offerSdp, iceServers)`, `setRemoteAudio(el)`, `toggleMute()`,
`hangup()`, y callbacks de estado (`onState`). Mantiene refs a `pc`,
`localStream`, `remoteStream`. Encapsula la espera no-trickle de ICE.

### UI — `src/app/(app)/_components/call-panel.tsx` (create)

Widget flotante (cliente) montado en el layout `(app)` junto al
`IncomingCallPoller`. Máquina de estados visible:
`idle → ringing(entrante) → connecting → connected → ended`.
- En `ringing`: tarjeta con nombre/teléfono + **Atender** / **Rechazar**.
- En `connected`: nombre, **cronómetro** en vivo, **Silenciar**, **Colgar**.
- Contiene el `<audio autoplay>` oculto para el stream remoto.
- Reusa la señal del poller: cuando el poller ve una llamada `ringing`, en vez
  de (o además de) el toast, alimenta al `CallPanel`. Refactor: el poller
  expone el estado vía un store ligero compartido (módulo con suscriptores, sin
  dependencia nueva) o un contexto React montado en el layout.

### Datos — migración 0011 (modify schema)

- Añadir `"connected"` al enum de `calls.status`
  (`ringing | connected | missed | completed | rejected | failed`).
- Añadir `answeredAt: integer("answered_at", { mode: "timestamp" })`.
- `recordCallEvent`/`statusFor`: `connected` es no-terminal (puede pasar a
  `completed`/`missed` en el `terminate`); ajustar la guarda de "no revivir"
  para que un `terminate` SÍ pueda cerrar un `connected`.

### Grabación (client-side) — última tarea, separable como Fase 2b

- Al `connected`: `AudioContext` mezcla `localStream` + `remoteStream` mediante
  dos `MediaStreamAudioSourceNode` → un `MediaStreamAudioDestinationNode` → su
  `.stream` alimenta un `MediaRecorder` (`audio/webm;codecs=opus`).
- Al colgar: `recorder.stop()` → `Blob` → subir vía un route handler
  `POST /api/calls/{callId}/recording` que llama `saveMediaAsset(db, {orgId,
  bytes, mime:"audio/webm", kind:"audio"})` y guarda `mediaAssetId` en una
  columna nueva `calls.recordingMediaId` (parte de mig 0011).
- Reproducción: en `/llamadas` y en `call-entry.tsx` del hilo, si hay
  `recordingMediaId`, mostrar un `<audio controls>` apuntando a
  `publicMediaUrl(id)`.
- **Riesgo declarado**: la grabación depende de que la pestaña siga viva; si el
  agente cierra el navegador a media llamada, no hay grabación. Aceptable para
  v1.

### Infra — coturn en vps-prod-01 (ops, documentado en el plan)

- Instalar coturn (UDP/TCP 3478 + TLS 5349, rango de puertos relay), modo
  `use-auth-secret` con `static-auth-secret` = `TURN_SECRET`.
- Firewall: abrir puertos UDP relay. Dominio/cert para TURNS (reusar Caddy/LE).
- Env nuevos (zod en `src/lib/env.ts`): `TURN_URL` (p.ej.
  `turn:turn.luladev.com:3478`), `TURN_SECRET`. Sin estos, `getIceServers()`
  cae a STUN-only y se loguea un aviso.

## Verificación

- **Unit tests** (`tests/unit/`): builder de `callAction` (cuerpos POST de
  accept/reject/terminate con mock fetch), `getIceServers` (formato de
  credencial efímera, fallback STUN-only sin env), y los cambios de estado en el
  store (`connected`, terminate cierra connected). La capa WebRTC del navegador
  no se unit-testea.
- **Verificación manual** con **número de PRODUCCIÓN de Meta** (el de pruebas no
  entrega audio al receptor). Llamada real entrante → atender → oír audio bi-
  direccional → silenciar → colgar → ver duración y (si aplica) grabación en
  `/llamadas`.
- `bun run lint`, `npx tsc --noEmit | grep ^src/` (limpio), `bun run test`.
- Code review (`code-reviewer`) antes de merge. Deploy vía `deploy/deploy.sh`
  (mig 0011) + provisión de coturn.

## Fuera de alcance (futuro)

- Bot de voz con IA (STT→LLM→TTS) — exige gateway de media server-side.
- Llamadas salientes (Fase 3): negocio inicia, requiere callback permission del
  usuario + el mismo stack WebRTC.
- Enrutamiento/ring multi-agente, transferencias, hold, IVR.
- Grabación server-side (exigiría gateway de media).

## Decomposición sugerida del plan

- **Fase 2a (núcleo):** Tasks de calling.ts, server actions (offer/ice/accept/
  reject/terminate), migración 0011 (connected + answeredAt), call-session.ts,
  call-panel.tsx, integración con el poller, coturn. Software funcional:
  atender/rechazar/colgar/mute con audio.
- **Fase 2b (grabación):** AudioContext mixing + MediaRecorder + route handler de
  upload + columna recordingMediaId + reproducción. Separable; el núcleo ya es
  útil sin esto.
