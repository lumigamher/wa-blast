# WhatsApp Calling — Pulido Fase 1 (diseño)

Fecha: 2026-06-15
Proyecto: wa-blast (Lula)
Estado: aprobado, pendiente de implementación

## Contexto

La Fase 1 de WhatsApp Calling está desplegada en luladev.com: tabla `calls`
(migración 0008), parseo del webhook `value.calls[]`, registro inline en el
hilo, vista `/llamadas` y configuración `/configuracion/llamadas` para
habilitar el calling. **Sin audio.**

Antes de avanzar a Fase 2 (atender con audio vía WebRTC), pulimos la Fase 1 en
cuatro frentes. Es trabajo de bajo riesgo que además deja preparado el terreno
para la negociación SDP de Fase 2.

Roadmap mayor (fuera de este spec): Fase 2 = atender llamadas con audio real;
Fase 3 = realizar llamadas salientes. Ambas requieren la decisión de
arquitectura WebRTC-en-navegador vs gateway de media, que se brainstormeará en
su propio spec.

## Datos de Meta verificados

- Evento `connect`: el objeto de llamada incluye `session: { sdp, sdp_type }`
  (la oferta WebRTC del usuario).
- Evento `terminate`: incluye `status`, `duration`, `start_time`, `end_time`,
  `biz_opaque_callback_data`.
- `direction`: `USER_INITIATED` (entrante → `in`) / `BUSINESS_INITIATED`
  (saliente → `out`).

El schema actual del webhook (`src/lib/meta/webhook.ts`) ya captura `status` y
`duration` con `.passthrough()`, pero **no extrae `session`**.

## Alcance

### Migración 0010 — columnas SDP

Añadir a `calls` (`src/lib/db/schema/domain.ts`):

- `sdp: text("sdp")` — null por defecto.
- `sdpType: text("sdp_type")` — null por defecto.

Generar la migración con `drizzle-kit generate` (siguiente número: `0010`).
Estas columnas **solo se escriben** en esta fase; ningún lector las consume aún
(prep directa para la oferta SDP de Fase 2).

### 1. Captura de SDP en el webhook

- **Schema** (`src/lib/meta/webhook.ts`): el objeto dentro de `calls[]` gana
  `session: z.object({ sdp: z.string().optional(), sdp_type: z.string().optional() }).optional()`.
- **`handleCallEvent`** (`src/lib/meta/webhook-handlers.ts`): extrae
  `call.session?.sdp` / `call.session?.sdp_type` y los pasa a `recordCallEvent`
  (solo tienen sentido en el `connect`).
- **`CallEvent`** y **`recordCallEvent`** (`src/lib/calls/store.ts`): el tipo
  gana `sdp?: string` y `sdpType?: string`. En el insert se persisten; en el
  update solo se escriben si llegan (no pisar con null un SDP ya guardado).

### 2. Notificación de llamada entrante (polling, no SSE)

Sigue el patrón existente del inbox: `Poller` con `setInterval` de 5s +
`router.refresh()` (`src/app/(app)/inbox/_components/poller.tsx`). **No** se
introduce SSE/WebSocket.

- **Server action** `getRingingCalls(orgId)` (en `src/lib/calls/store.ts` o un
  `actions.ts` de `/llamadas`): devuelve llamadas `direction = "in"`,
  `status = "ringing"`, `createdAt` dentro de los últimos ~60s, sin `endedAt`.
  Incluye `conversationId`, `phone`, nombre de contacto.
- **Componente cliente** `IncomingCallPoller` (clon de `Poller`), montado en el
  layout `(app)` para que viva en toda la app autenticada:
  - Cada 5s llama a `getRingingCalls`.
  - Mantiene un `Set` de ids ya notificados (en estado del componente) para no
    repetir el toast en cada poll.
  - Para cada llamada `ringing` con id nuevo: dispara un toast **sonner**
    `"📞 Llamada entrante de {nombre || phone}"` con acción **"Ver"** que navega
    a `/inbox/{conversationId}`.
  - Reproduce un sonido suave (corto, bajo volumen) con fallback silencioso si
    el navegador bloquea autoplay o el archivo no carga (try/catch sobre
    `audio.play()`).
  - Respeta `document.hidden` igual que el `Poller` actual.
- **Aún no hay botón "atender"** — eso es Fase 2. El toast solo avisa y enlaza
  a la conversación.

### 3. Edge cases de estado + tests

Refinar `statusFor` (`src/lib/calls/store.ts`) usando el `status`/`duration`
reales de Meta:

- `connect` → `ringing`.
- `terminate`:
  - `status` contiene `reject` → `rejected`.
  - `status` contiene `fail` o `error` → `failed`.
  - `status` indica no-contestada / expirada, o `duration` ausente/0 → `missed`.
  - `duration > 0` → `completed`.
- **Terminate sin connect previo** (llamada perdida nunca atendida): el upsert
  por `(orgId, wacid)` inserta directamente con `status = "missed"`. Verificar
  que no quede `ringing` colgado.
- **Connect tras terminate** (orden invertido): no debe revivir a `ringing` una
  llamada ya `completed`/`missed`. El update debe preservar el estado terminal.

**Tests** (`src/lib/calls/*.test.ts`):
- `statusFor` por cada rama (ringing, rejected, failed, missed por duration 0,
  missed por status, completed).
- Orden de eventos: connect→terminate (queda completed/missed correcto);
  terminate-solo (queda missed); terminate→connect (no revive ringing).
- Captura de SDP: connect con `session` puebla `sdp`/`sdpType`.
- `getRingingCalls`: filtra por ventana de tiempo, dirección y status.

### 4. UI `/llamadas`

`src/app/(app)/llamadas/page.tsx`:

- **Badge contador de perdidas** en el filtro "Perdidas" (y/o en el header).
- **Empty states por filtro** (texto específico: "Sin perdidas", "Sin
  contestadas", etc., además del genérico y el de búsqueda).
- **Agrupación por día**: encabezados "Hoy / Ayer / {fecha}" sobre la lista
  ordenada por `createdAt` desc.
- Duración vacía se muestra como `—` en vez de ocultarse.

## Verificación

`bun run lint && bun run typecheck && bun test`, luego pasar el diff por el
subagent `code-reviewer`. Merge a `main` y deploy vía `deploy/deploy.sh` (la
migración 0010 se aplica en el deploy, igual que 0008/0009).

## Fuera de alcance

- Cualquier audio / WebRTC / negociación SDP real (Fase 2).
- Llamadas salientes (Fase 3).
- Lectura/uso de las columnas `sdp`/`sdpType` (solo se escriben aquí).
