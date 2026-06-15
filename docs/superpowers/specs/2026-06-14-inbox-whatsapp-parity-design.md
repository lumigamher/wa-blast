# Inbox paridad WhatsApp Business — Design Spec

**Fecha:** 2026-06-14
**Proyecto:** Lula (`wa-blast`)
**Estado:** Aprobado por Luis, pendiente de plan de implementación.

## Objetivo

Llevar el inbox a paridad funcional con **WhatsApp Business**: notas de voz (enviar/recibir/reproducir), stickers (colección guardada + enviar + recibir), reacciones **vinculadas al mensaje original**, arreglo del scroll (la página crece infinita), y un rediseño **minimal con UX moderna e iconografía amigable** (lucide). Todo respetando la **ventana de 24h** de la Cloud API.

## Contexto del código actual (verificado 2026-06-14)

- **Shell:** `src/app/(app)/layout.tsx` envuelve cada página en `<main class="flex-1 overflow-y-auto"><div class="mx-auto max-w-7xl px-6 py-8 …">`. El sidebar ya existe a la izquierda.
- **Inbox UI:** `src/app/(app)/inbox/page.tsx` (lista + estado vacío) y `inbox/[id]/page.tsx` (lista + hilo). Render del hilo en `[id]/_components/{thread-and-composer,thread,composer,mark-read-on-open}.tsx`.
  - **Bug scroll:** el grid del inbox no tiene altura acotada; el panel derecho `flex flex-col` no fija altura → el `flex-1 overflow-y-auto` del `Thread` se expande al contenido y la página crece. Falta cadena `min-h-0` + altura de viewport.
  - El header `<h1>Inbox</h1>` + descripción es redundante con el sidebar → se elimina.
- **Acciones:** `src/app/(app)/inbox/actions.ts`: `sendMessageAction`, `sendTemplateToConversationAction`, `markReadAction`, `sendMediaAction`, `sendReactionAction`.
- **Cliente Meta:** `src/lib/meta/client.ts`: `sendText`, `sendTemplate`, `sendFlow`, `markRead`, `uploadMedia`, `sendMedia` (kinds: image|audio|video|document), `sendReaction`, `classify`.
- **Webhook:** `src/app/api/webhook/meta/route.ts` + `src/lib/meta/webhook-handlers.ts` + `src/lib/inbox/parse-inbound.ts`. Reacción entrante se parsea como **mensaje suelto** `type:"reaction"` (NO se vincula al objetivo).
- **Schema:** `src/lib/db/schema/domain.ts`: `conversations`, `messages` (con `wamid`, `type`, `body`, `mediaId`, `status`, `payloadJson`), `mediaAssets`, `inboxMediaCache`, `quickReplies`. No hay tabla de reacciones ni de stickers.
- **Media:** entrante se descarga/cachea vía `src/app/api/inbox/media/[mediaId]/route.ts` (Meta media id → asset local). **Saliente: `mediaId` queda null → el media enviado NO se renderiza en el hilo.**
- **Ventana 24h:** `src/lib/inbox/window.ts` (`isWindowOpen`, `WINDOW_MS`). Con ventana cerrada el composer fuerza modo plantilla.
- **Infra:** ffmpeg disponible (local confirmado; verificar/instalar en prod). NO hay `sharp`. Se usa **ffmpeg** para audio→ogg/opus y para imagen→webp (evita añadir `sharp`).

## Decisiones de diseño

### 1. Reacciones vinculadas
Nueva tabla `message_reactions`:
- `id` (PK), `orgId`, `conversationId`, `targetWamid` (wamid del mensaje reaccionado), `direction` (`"in"` cliente reaccionó / `"out"` nosotros), `emoji` (text, vacío = sin reacción), `updatedAt`.
- Índice único `(orgId, targetWamid, direction)` — una reacción por lado por mensaje (igual que WhatsApp).
- Reaccionar = **upsert**; `emoji === ""` → borrar la fila.
- **Webhook:** reacción entrante → upsert en `message_reactions` (`targetWamid = msg.reaction.message_id`, `direction:"in"`). NO crea mensaje.
- **`sendReactionAction`:** upsert (`direction:"out"`) + `client.sendReaction`. NO crea mensaje.
- **Render:** por cada mensaje, buscar reacciones por su `wamid`; pintar **chip** en la esquina inferior de la burbuja (emoji). Los mensajes `type:"reaction"` históricos dejan de pintarse como burbuja (filtrados en render). Backfill a la tabla nueva = opcional (script best-effort).

### 2. Notas de voz
- **Grabar:** `MediaRecorder` en el navegador (Chrome→webm/opus, Safari→mp4). UI: micrófono → grabando (timer en vivo, cancelar, enviar).
- **Enviar:** nueva `sendVoiceAction(conversationId, { dataBase64, mime })` → servidor transcodifica a **`audio/ogg` (opus)** con ffmpeg → `uploadMedia` → `sendMedia` kind `audio`. Meta lo entrega como nota de voz.
- **Guardar copia local** del ogg en `media_assets` (kind `audio`) para reproducir el saliente.
- **Reproductor:** componente minimal propio (play/pausa + barra de progreso + duración), usado para voz y audio, entrante y saliente. Sin waveform en v1 (nice-to-have futuro).

### 3. Stickers (colección guardada)
- Nueva tabla `stickers`: `id` (PK), `orgId`, `assetId` (→ `media_assets`, webp), `createdAt`. Índice por `orgId`.
- **Añadir:** subir imagen → ffmpeg a **webp 512×512** → `media_assets` (kind `sticker`) → fila en `stickers`.
- **Enviar:** picker popover (grid de stickers de la org, clic = enviar inmediato). `client.sendMedia` gana kind `sticker` (sin caption). `sendStickerAction(conversationId, { stickerId })` → `uploadMedia(webp)` → `sendMedia` kind sticker → registra mensaje `type:"sticker"` con copia local renderizable.
- **Recibir:** ya se descargan; render transparente ~128px (sin fondo de burbuja).

### 4. Media saliente visible
- En `sendMediaAction`/`sendVoiceAction`/`sendStickerAction`, guardar el archivo enviado como `media_assets` local y referenciarlo en el mensaje (p. ej. `mediaId` = id del asset local con prefijo, o nuevo campo) para que el hilo renderice lo que enviamos.
- `/api/inbox/media/[mediaId]/route.ts` debe servir **assets locales por id** además de media de Meta (resolver: ¿es asset local? sírvelo; si no, descarga de Meta como hoy).

### 5. Layout / scroll
- Eliminar header redundante.
- Inbox a **altura de viewport** con la cadena `min-h-0`/`h-full` correcta. Dos paneles con scroll interno independiente. Hilo auto-scroll al último mensaje (y al recibir nuevos); composer fijo. Ajustar el shell `(app)/layout.tsx` lo mínimo para permitir una página full-height sin romper las demás rutas (las demás conservan padding + scroll propio).

### 6. Rediseño minimal (inbox completo, iconos amigables lucide)
- **Lista:** avatar iniciales, nombre, preview con ícono por tipo (imagen/voz/sticker/doc), hora, badge no leídas, resaltado activo, búsqueda, filtro "no leídas".
- **Hilo:** separadores de fecha (Hoy/Ayer/fecha), agrupación de consecutivos, ticks de estado, chips de reacción, burbujas ceñidas.
- **Composer:** barra redondeada con adjuntar (popover: foto/video, documento, sticker), emoji, micrófono, y botón que alterna **mic ↔ enviar** según haya texto (como WhatsApp); preview de cita y de archivo. Toda acción con ícono lucide claro y `aria-label`.

### 7. Ventana de 24h
Sin cambios de regla: con ventana cerrada, voz/media/stickers/reacciones quedan deshabilitados y solo plantillas (igual que hoy con texto). Errores Meta `131047/131026` → `outside_24h` ya clasificados.

### 8. Auto-guardado de contactos
Hoy `getOrCreateConversation` enlaza una conversación a un `contact` existente por teléfono, pero **no crea el contacto** si no existe (`contactId` queda null). Cambio: en el primer mensaje entrante de un número desconocido, **crear el contacto automáticamente** (`contacts`, único por `(orgId, phone)`) y enlazarlo a la conversación.
- Nombre: usar `contacts[].profile.name` del payload del webhook si viene (hay que pasar el profile name a través de `handleInboundMessage` → `recordInboundMessage` → `getOrCreateConversation`); si no, `name` queda null y la UI muestra el teléfono.
- Idempotente: `onConflictDoNothing` por el único `(orgId, phone)` (no pisa un contacto ya editado).
- Si llega un nombre de perfil y el contacto existe sin nombre, completarlo (sin sobrescribir un nombre ya puesto a mano).

### 9. Notas internas
Nueva tabla `conversation_notes`: `id` (PK), `orgId`, `conversationId`, `authorUserId`, `authorName` (snapshot para mostrar sin join), `body`, `createdAt`. Índice `(conversationId, createdAt)`.
- **Nunca** se envían a Meta — son privadas del equipo.
- Store `src/lib/inbox/notes.ts`: `listNotes`, `addNote`, `deleteNote` (todas con `orgId` para aislamiento).
- Acciones `addNoteAction`/`deleteNoteAction` con `requireOrg` (autor = usuario de sesión).
- UI: ícono de nota (lucide, p. ej. `StickyNote`/`NotebookPen`) en el header de la conversación que abre un panel/drawer con la lista de notas (autor + hora) + añadir + borrar. Estilo distinto (ámbar) para que no se confunda con mensajes. No interfiere con la ventana de 24h.

## Unidades (para aislamiento y testeo)

1. `src/lib/media/transcode.ts` — wrappers ffmpeg: `toOggOpus(bytes)`, `toWebpSticker(bytes)`. Testeable con archivos fixture.
2. Schema + stores: `message_reactions` (`src/lib/inbox/reactions.ts`: `upsertReaction`, `removeReaction`, `getReactionsForMessages`), `stickers` (`src/lib/inbox/stickers.ts`: `listStickers`, `addSticker`, `deleteSticker`), `conversation_notes` (`src/lib/inbox/notes.ts`: `listNotes`, `addNote`, `deleteNote`).
3. Cliente Meta: `sendMedia` kind `sticker`.
4. Media local servible: ampliar `/api/inbox/media/[id]` + helper de persistencia de media saliente.
5. Acciones: `sendVoiceAction`, `sendStickerAction`, `addNoteAction`/`deleteNoteAction`, refactor de `sendReactionAction`; webhook de reacción.
6. Auto-contacto: `getOrCreateConversation`/`recordInboundMessage` crean y enlazan contacto (profile name del webhook).
7. UI: layout full-height, lista, hilo (chips reacción, separadores, agrupación, reproductor de audio), composer (mic, sticker picker, attach popover, mic↔enviar), panel de notas internas.

## Pruebas
- Unit: transcode (mimes de entrada → ogg/webp), reactions store (upsert/remove/aislamiento por org), stickers store (CRUD/aislamiento), notes store (CRUD/aislamiento), `sendMedia` kind sticker, parse/handle de reacción entrante (vincula, no crea mensaje), auto-contacto (crea contacto en primer entrante; idempotente; no pisa nombre manual).
- Integración: `sendVoiceAction`/`sendStickerAction` (gate suscripción + ventana 24h + registro + media local), media route sirve asset local, `addNoteAction` no toca Meta.
- Gate de ventana 24h respetado en todas las acciones nuevas (las notas NO dependen de la ventana).

## Fuera de alcance (v1)
- Waveform de audio. Recorte/edición de stickers (cutout de fondo). Packs de stickers de terceros. Reenvío/edición/borrado de mensajes. Llamadas (Fase 3).
