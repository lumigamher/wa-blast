# Inbox rediseño (maestro-detalle persistente) + pulido del agente (typing, reply, debounce)

**Fecha:** 2026-06-24
**Proyecto:** Lula (wa-blast) — inbox WhatsApp + agente IA
**Estado:** Diseño aprobado

## Contexto

El agente ya responde, pero en pruebas en vivo faltan pulidos y el inbox tiene
problemas estructurales de UX:

- El agente NO muestra "escribiendo…" (ni en WhatsApp ni en la UI), NO cita el
  mensaje al responder, y el debounce no se percibe preciso.
- El inbox son **dos rutas full-page separadas** (`inbox/page.tsx` lista +
  `inbox/[id]/page.tsx` detalle). Abrir una conversación navega a otra página →
  la lista y los filtros se **desmontan y recargan**; los filtros nuevos
  (agente/etiqueta) **desaparecen** al abrir un chat.

Hallazgos clave (ya verificados en el código):
- `src/lib/meta/client.ts`: `markRead(wamid, {typing:true})` ya envía
  `typing_indicator` (typing real de WhatsApp); `sendText`/`sendMedia` ya aceptan
  `replyTo` → `context.message_id` (cita). Solo falta cablearlos al agente.
- `src/lib/agent/queue.ts`: debounce por conversación que **reinicia** el timer
  en cada mensaje y dispara tras `DEBOUNCE_MS` (=6000) de silencio → ya coalesce
  múltiples mensajes en un turno. Solo hay que afinar la ventana.
- `src/lib/inbox/store.ts`: ya guarda/renderiza `replyToWamid` (citas entrantes).

## Alcance

Tres tracks, un solo plan (cada uno entrega software funcional por sí mismo):
- **Track 1 — Pulido del agente**: typing en WhatsApp, reply citado, debounce
  afinado.
- **Track 2 — Inbox UX**: maestro-detalle persistente (parallel routes), barra
  de filtros compacta, indicador "🤖 escribiendo…" en la UI, limpieza.
- **Track 3 — Envío de media por el agente**: biblioteca de archivos por org +
  generalización de la media de producto (imágenes/videos/documentos), con tools
  para que el agente envíe cualquier archivo por WhatsApp.

Fuera: realtime/websockets (se usa el poller existente), business-hours,
cambios al motor del agente más allá del wiring.

## Track 1 — Pulido del agente

### Typing en WhatsApp
- En `src/lib/agent/dispatch.ts` `runRealTurn` (el runner que corre tras el
  debounce): antes de `runAgentTurn`, obtener el `wamid` del último mensaje
  ENTRANTE de la conversación y llamar `markRead(settings, { wamid, typing:true })`.
  `runRealTurn` ya tiene `settings`. Si no hay wamid o creds, se omite (no rompe).
- El typing de WhatsApp dura ~25s o hasta que se envía un mensaje → el cliente
  ve "escribiendo…" durante el procesamiento y desaparece al llegar la respuesta.

### Reply citado
- `AgentSender` (tipo en `dispatch.ts`/`turn.ts`) gana un campo opcional
  `replyTo?: string`. En `turn.ts`, al enviar el `reply`, pasar
  `replyTo = wamid del último mensaje entrante` (computado del historial/DB).
- El sender en `dispatch.ts` pasa `replyTo` a `sendText`. Resultado: la respuesta
  del agente aparece citando el mensaje del cliente. Si no hay wamid, envía normal.

### Debounce preciso
- `dispatch.ts`: `DEBOUNCE_MS` 6000 → **8000**, expuesto como constante
  configurable por env (`AGENT_DEBOUNCE_MS`, default 8000). El mecanismo de
  reset-por-mensaje (queue.ts) se mantiene: garantiza UNA respuesta tras el
  silencio. (No se añade lógica adaptativa compleja v1; la ventana fija + reset
  cubre "esperar a que termine de escribir".)

## Track 2 — Inbox UX

### Indicador "🤖 escribiendo…" en la UI (dato)
- Migración aditiva: columna `conversations.agentTypingUntil` (integer timestamp,
  nullable).
- `dispatch.runRealTurn`: al empezar el turno, set `agentTypingUntil = now + 30s`
  (junto con el typing de WhatsApp). Al registrar la respuesta saliente (o en
  error/fin), set `agentTypingUntil = null`.
- Helper en `src/lib/agent/pause.ts` o `src/lib/inbox/store.ts`:
  `setAgentTyping(db, conversationId, until: Date | null)`.
- La UI muestra "🤖 escribiendo…" cuando `agentTypingUntil != null && >
  now` (se expone en el item de lista y en el detalle). El poller existente lo
  refresca y se limpia solo.

### Maestro-detalle persistente (Parallel Routes)
Reestructura para que abrir una conversación NO recargue la lista ni los filtros:
- `src/app/(app)/inbox/layout.tsx` (nuevo): shell de 2 paneles que renderiza los
  slots `list` y `detail`:
  ```tsx
  export default function InboxLayout({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
    return <div className="flex h-full min-h-0"><div className="w-[340px] shrink-0 border-r ...">{list}</div><div className="flex-1 min-h-0">{detail}</div></div>;
  }
  ```
- `src/app/(app)/inbox/@list/default.tsx` (nuevo): renderiza `<ConversationListPane/>`
  (CLIENT). Como es `default.tsx`, **persiste** y NO se re-renderiza al navegar el
  slot `@detail`.
- `src/app/(app)/inbox/@detail/default.tsx` (nuevo): estado vacío
  ("Selecciona una conversación").
- `src/app/(app)/inbox/@detail/[id]/page.tsx`: el detalle actual (hilo + composer
  + contact panel) movido aquí TAL CUAL (mismos `_components`).
- `src/app/(app)/inbox/page.tsx`: queda mínimo (children slot) o redirige al
  estado de los slots; el contenido real vive en los slots.

**ConversationListPane** (`src/app/(app)/inbox/_components/conversation-list-pane.tsx`,
CLIENT):
- Lee filtros de la URL con `useSearchParams()` (q, status, unreadOnly, agent,
  label) y los cambia con `router.replace` (shallow, sin recargar el detalle).
- Trae datos vía **server action** `getInboxData({ q, status, unreadOnly, agent,
  labelId })` → `{ conversations: (ConversationListItem & { labels, agentTyping })[],
  labels, agentEnabled }`. Refetch en cambio de filtros (no al seleccionar una
  conversación).
- Cada fila: `<Link href="/inbox/[id]">` (cambia solo `@detail`); resalta la
  activa con `usePathname()`. Muestra `AgentBadge`, `LabelChips`, y "🤖
  escribiendo…" si aplica.
- Mantiene su scroll porque NO se desmonta al abrir conversaciones.

**Server action** `getInboxData` en `inbox/actions.ts`: `requireOrg` →
`listConversations` + `labelsByConversation` + `listLabels` +
`getAgentConfig().enabled`, devuelto al cliente (sin secretos). Reusa la capa
existente.

### Barra de filtros compacta
En `ConversationListPane`, un toolbar denso (no filas full-width apiladas):
- Fila 1: input de búsqueda.
- Fila 2: segmented Estado (Abiertas/Resueltas/Todas).
- Fila 3: toggles pill compactos 🤖 IA / 🧑 Humano / • No leídas + dropdown
  "🏷 Etiqueta ▾".
Toggles que prenden/apagan el filtro (re-set del query param). Estilo
Chatwoot/WhatsApp-web. Solo muestra IA/Humano si `agentEnabled`.

### Responsive
Desktop: 2 paneles (lista 340px + detalle). Móvil (`md:` breakpoint): se ve la
lista; al abrir una conversación, el panel detalle ocupa todo con botón "←" para
volver a la lista (se logra con clases responsive sobre los slots + un control de
"volver" en el header del detalle).

### Limpieza
Borrar los `*_2.tsx` reinyectados por iCloud (ya hecho al crear la rama;
verificar que no reaparezcan y que no estén en git).

## Track 3 — Envío de media por el agente

**Estado actual (verificado):** `enviar_foto_producto` YA resuelve el producto
vía el `CatalogProvider` activo (interno/HTTP/**Shopify/Medusa**) y su helper
`fetchImageBytes` baja tanto assets locales como **URLs externas** → enviar
**imágenes de producto desde las integraciones ya funciona**. Lo que falta:
videos/documentos y una biblioteca de archivos arbitrarios por org.

### A) Biblioteca de archivos por org
- Migración aditiva: tabla `agent_media_library` (id, orgId FK org cascade,
  `kind` enum image|video|document, `mediaAssetId` text (asset en el media store),
  `label` text, `productId` text nullable (asociación opcional a un producto),
  `createdAt`).
- Capa `src/lib/agent/media-library.ts`: `listMedia(db,orgId,{productId?})`,
  `addMedia(db,orgId,{kind,mediaAssetId,label,productId?})`,
  `deleteMedia(db,orgId,id)`, `findMedia(db,orgId,query)` (match por label/kind).
  Todo scoped por org.
- Subida: endpoint/acción que guarda el archivo con `saveMediaAsset` (media store
  existente) y crea la fila. UI panel: sección "Biblioteca" en
  `/configuracion/agente/catalogo` (o nueva sub-ruta) con **dropzone**
  (multi-archivo, etiqueta, kind autodetectado por mime, asociación opcional a
  producto), listar/borrar. Reusa el patrón de dropzone de productos/RAG.

### B) Tool `enviar_archivo`
- `src/lib/agent/tools/builtin/enviar-archivo.ts`: params `{ query?: string;
  mediaId?: string; productId?: string }`. Resuelve un item de la biblioteca
  (por id, o por `findMedia(query)`, opcionalmente filtrado por producto), lee los
  bytes del asset (`getMediaAsset`+`readFile`), `uploadMedia` a Meta y `sendMedia`
  con el **tipo correcto** (image/video/document según `kind`/mime). Scoped por
  org (guard `asset.orgId`); errores → `{ok:false}` legible, nunca rompe el turno.
  Registrado en el registry (opt-in por org como las demás tools).
- Generaliza el helper de envío para mapear mime→tipo Meta (image/video/document/
  audio) — reutilizable por `enviar_foto_producto` y `enviar_archivo`.

### C) Media de producto generalizada
- Las **imágenes** de producto (interno + integraciones) ya se envían con
  `enviar_foto_producto` (sin cambios). Para **videos/documentos de un producto**:
  se suben a la biblioteca con `productId` asociado; el agente los envía con
  `enviar_archivo` (filtrando por producto). No se modifica `product_images` ni
  los conectores (Medusa/Shopify devuelven imágenes; videos/docs viven en la
  biblioteca). Esto cubre "enviar cualquier item" sin reescribir el catálogo.

### Panel y gating
Sección "Biblioteca" en configuración del agente (gated módulo `agente`). Tool
`enviar_archivo` opt-in en Herramientas.

## Testing

- Track 1: test de `dispatch`/`turn` con mocks — typing se invoca al inicio del
  turno con el wamid entrante; `replyTo` se pasa al sender con el último wamid
  entrante; debounce sigue coalesciendo (un turno tras varios mensajes).
- `setAgentTyping` (store/pause): set/clear refleja en la lectura.
- `listConversations`/`getInboxData`: incluyen `agentTypingUntil`/typing flag.
- UI: estructura/parallel-routes se valida con `bun run build` + verificación en
  vivo (abrir conversaciones sin recargar la lista; filtros persisten; typing y
  reply visibles; debounce coalesce).
- Track 3: `media-library` (add/list/find/delete scoped por org); `enviar_archivo`
  con mocks (resuelve item, sube y envía con el tipo correcto, guard de org,
  error→{ok:false}); helper mime→tipo Meta (image/video/document).

## Migración y despliegue

Migración aditiva (columna `agentTypingUntil` + tabla `agent_media_library`). Rama
`feat/inbox-redesign-agente-pulido` → subagentes TDD → review → merge → deploy
(`deploy/deploy.sh`, health 200). Verificación en vivo en la org "luis"
(49644ae3) con El Man.

## Riesgos / notas

- **Parallel routes**: cuidar `default.tsx` en ambos slots para que `/inbox` y
  `/inbox/[id]` (con hard refresh) rendericen bien; el slot `@list` como
  `default.tsx` cliente persiste sin re-render al cambiar `@detail`. El detalle
  pesado (composer/media/voz/reacciones/búsqueda) se MUEVE intacto a
  `@detail/[id]` — no reescribir esos componentes.
- **Poller**: el poller existente seguirá refrescando; con el list pane cliente,
  el refetch debe ser por server action, no `router.refresh()` global (evitar
  recargar el detalle). Ajustar el poller para refrescar solo los datos del list
  pane.
- **Typing WhatsApp**: requiere que el mensaje entrante tenga wamid; si Meta no lo
  provee o faltan creds, se omite silenciosamente.
- **GOTCHA deploy** (de sesiones previas): no correr dos `deploy.sh` en paralelo
  (colisión `bun install`); `bunx vitest run` a veces queda colgado — no
  encadenar `vitest ; deploy` en background.
