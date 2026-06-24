# Inbox: control del agente + etiquetas de conversación + auto-reload tras deploy

**Fecha:** 2026-06-23
**Proyecto:** Lula (wa-blast) — inbox WhatsApp + agente IA
**Estado:** Diseño aprobado

## Contexto y motivación

Tras activar el agente, el inbox no da visibilidad ni control sobre la IA
(verificado en código 2026-06-23):

1. **No se ve quién atiende**: `conversations.agentPaused` existe pero no se
   pinta en la lista ni en el header del detalle; `ConversationListItem` ni
   siquiera lo trae.
2. **No hay etiquetas de conversación**: solo existen tags de CONTACTO
   (`/contactos/tags`), invisibles desde el inbox. No hay forma de "tagear el
   chat".
3. **El handoff es silencioso**: `pauseAgent` solo setea `agentPaused=true`; el
   inbox no muestra banner, badge ni mensaje de sistema, ni permite "retomar IA".
4. Además, cada deploy rompe las pestañas abiertas con "Algo salió mal" (Server
   Action obsoleta de Next.js) hasta recargar a mano.

Este trabajo cubre los 4 puntos.

## Decisiones (brainstorming)

- **Etiquetas = de CONVERSACIÓN, estilo Chatwoot** (tabla nueva, aisladas de los
  tags de contacto).
- **Control de IA por chat**: badge IA/Humano + filtro + botones manuales
  pausar/retomar + banner de handoff.
- **Incluir el auto-reload** tras deploy en esta misma tanda.

## Alcance

Dentro: A) control del agente en el inbox, B) etiquetas de conversación,
C) auto-reload tras deploy. Fuera: business-hours gating, mensajes de sistema
persistidos en el hilo, etiquetas compartidas con contactos, automatizaciones
por etiqueta.

## Componente A — Control del agente en el inbox

**Datos**
- `src/lib/agent/pause.ts`: ya tiene `pauseAgent`/`isPaused`. Añadir
  `setAgentPaused(db, orgId, conversationId, paused: boolean)` (filtra por orgId
  + conversationId) y `resumeAgent` como azúcar. (Mantener `pauseAgent` para la
  auto-pausa existente.)
- `src/lib/inbox/store.ts`: añadir `agentPaused: boolean` a `ConversationListItem`
  y al SELECT de la lista; añadir `agentPaused` al detalle de conversación que
  carga el header.
- Conocer si el agente está activo a nivel org: el badge "🤖 IA" solo aplica si
  `getAgentConfig(db, orgId).enabled === true`. El server component del inbox ya
  puede leerlo una vez y pasarlo a la lista/detalle.

**UI**
- **Badge** (componente `AgentBadge`): en cada item de la lista y en el header
  del detalle. Estados: agente org deshabilitado → sin badge; `enabled` y
  `!agentPaused` → "🤖 IA"; `enabled` y `agentPaused` → "🧑 Humano".
- **Filtro** en la lista: Todas / 🤖 IA / 🧑 Humano (query param `?agent=ia|humano`,
  filtra en el SELECT por `agentPaused`). Coexiste con el filtro de estado actual.
- **Banner + botones** en el header del detalle: si `agentPaused` → banner "La IA
  está en pausa en este chat" + botón **"Retomar IA"**; si activo → botón
  **"Pausar IA"**. Solo se muestran si el agente está `enabled` en la org.
- Server action `setAgentPausedAction(conversationId, paused)` (requireOrg →
  setAgentPaused → revalidate inbox). No altera la auto-pausa al escribir un
  humano (`inbox/actions.ts` sigue llamando `pauseAgent`).

## Componente B — Etiquetas de conversación (Chatwoot-style)

**Datos (migración aditiva)**
```ts
export const conversationLabels = sqliteTable("conversation_labels", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
export const conversationLabelLinks = sqliteTable("conversation_label_links", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  labelId: text("label_id").notNull().references(() => conversationLabels.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.conversationId, t.labelId] }) }));
```
Aisladas de `tags`/`contactTags`.

**Capa `src/lib/inbox/labels.ts`** (todo scoped por orgId):
- `listLabels(db, orgId)` → catálogo.
- `createLabel(db, orgId, {name, color})` → id (valida nombre no vacío; evita
  duplicado por nombre case-insensitive en la org).
- `deleteLabel(db, orgId, labelId)`.
- `getConversationLabels(db, orgId, conversationId)` → labels asignadas.
- `setConversationLabels(db, orgId, conversationId, labelIds[])` → reemplaza el
  set (valida que conversación y labels son de la org).
- Para la lista: `labelsByConversation(db, orgId, conversationIds[])` → map id→labels[]
  (una query, evita N+1).

**UI**
- **Chips** de etiqueta (componente `LabelChips`) en cada item de la lista y en
  el header del detalle.
- **Popover de etiquetas** en el detalle: lista el catálogo con checkboxes
  (asignar/quitar) + crear etiqueta al vuelo (nombre + color) → guarda con
  `setConversationLabels`.
- **Filtro por etiqueta** en la lista (query param `?label=<id>`).
- Server actions: `createLabelAction`, `deleteLabelAction`,
  `setConversationLabelsAction` (requireOrg + revalidate).

## Componente C — Auto-reload tras deploy

Next.js rota el ID de cada Server Action por build; una pestaña abierta de antes
del deploy dispara `Error: Failed to find Server Action "…" … older or newer
deployment` y el error boundary muestra "Algo salió mal".

- Detectar ese error en el **error boundary** (`src/app/(app)/error.tsx`; si no
  existe, crearlo; evaluar también `global-error.tsx`). Si
  `error.message.includes("Failed to find Server Action")` (o el digest
  correspondiente):
  - Guard anti-bucle: marcar `sessionStorage["sa-reloaded"]`; si ya estaba,
    NO recargar (mostrar la UI de error normal con botón Reintentar).
  - Si no estaba: setear la marca, mostrar un toast/sentencia "Actualizando a la
    nueva versión…" y `window.location.reload()`.
  - Limpiar la marca en un `useEffect` de carga normal (cuando la página monta
    sin error) para permitir el auto-reload en futuros deploys.
- Es un client component (`"use client"`), solo usa React + `window`/`sessionStorage`
  (sin imports que arrastren SDK al bundle).

## Testing

- `inbox/labels.ts`: CRUD + scoping (no cruza orgs), `setConversationLabels`
  reemplaza set, dedupe por nombre, `labelsByConversation` sin N+1.
- `agent/pause.ts`: `setAgentPaused` true/false scoped por org; `isPaused`
  refleja el cambio.
- `inbox/store.ts`: `ConversationListItem` incluye `agentPaused`; filtro
  `agent=ia|humano` y `label=<id>` filtran bien.
- Componentes: `AgentBadge` (3 estados), banner/botones según estado, `LabelChips`.
- Error boundary: detecta el patrón y llama reload una vez; con la marca puesta
  NO recarga (anti-bucle).

## Migración y despliegue

Migración aditiva (2 tablas nuevas; nada se altera/borra). Rama
`feat/inbox-agente-etiquetas` → subagentes TDD → review → merge → deploy
(`deploy/deploy.sh`, health login 200). Verificación en vivo en la org de
pruebas "luis" (49644ae3): badge IA, pausar/retomar, crear y asignar una
etiqueta, filtrar, y forzar el auto-reload tras un deploy.

## Riesgos / notas

- El digest del error de Server Action puede variar entre dev/prod; detectar por
  `message` y, si está disponible, por `digest`. Si Next.js no expone el mensaje
  al boundary en prod, fallback: detectar por `error.digest` conocido o por un
  reintento fallido. Confirmar en el plan leyendo cómo se ve el error en el
  boundary.
- El badge "IA" depende de `agentConfig.enabled` (org) — cargarlo una vez en el
  server component del inbox, no por fila.
