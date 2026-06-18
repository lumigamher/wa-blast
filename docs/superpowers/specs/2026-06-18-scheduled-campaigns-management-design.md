# Gestión de campañas programadas — Diseño

**Fecha:** 2026-06-18
**Proyecto:** wa-blast (Lula) — luladev.com
**Estado:** Aprobado para implementación

## Problema

1. **Campañas de prueba atascadas en "pendiente" que nunca se enviaron.** No hay forma
   de limpiarlas: no existe UI para eliminar campañas.
2. **No hay gestión de campañas programadas.** Una vez creada una campaña con fecha
   futura (`status='draft'` + `scheduledAt`), no se puede cancelar, reprogramar ni editar.
3. **Raíz de "nunca se enviaron":** el endpoint `/api/cron/run-scheduled` existe pero
   nada lo dispara en prod (no hay systemd timer ni crontab en el repo ni —presumiblemente—
   en el servidor). Las campañas con fecha programada se quedan en `draft` para siempre.

## Estado actual relevante

- **Schema** (`src/lib/db/schema/domain.ts`): tabla `campaigns` con columna `status`
  (texto libre, default `draft`) y `scheduledAt` (timestamp, nullable). `campaign_recipients`
  referencia `campaigns` con `onDelete: cascade`. `foreign_keys = ON` en el cliente
  (`src/lib/db/client.ts`), por lo que borrar una campaña arrastra sus destinatarios.
- **Estados en uso:** `draft` (programada con fecha, o atascada sin fecha) → `queued`
  → `sending` → `done` / `failed`.
- **Scheduler:** `src/app/api/cron/run-scheduled/route.ts` — GET protegido por `CRON_SECRET`;
  busca `status='draft' AND scheduledAt <= now`, pasa a `queued` y llama
  `getWorker(db).runCampaign(id)` en proceso.
- **Lista:** `src/app/(app)/campanas/page.tsx` — filtra `scheduled = draft && scheduledAt`,
  `running = queued|sending`, `done = done|failed`. **Los `draft` sin `scheduledAt` no
  aparecen en ninguna sección** (ahí se esconden las de prueba atascadas).
- **Server actions de campaña:** `src/app/(app)/campanas/[id]/actions.ts`
  (`retryFailedAction`), `src/app/(app)/campanas/nueva/actions.ts` (`createCampaignAction`).
- **Wizard de creación:** `src/app/(app)/campanas/nueva/wizard.tsx` (1023 líneas).
- **Multi-tenancy:** `requireOrg()` (`src/lib/auth/session.ts`) + verificación
  `campaign.orgId === orgId` antes de mutar.

## Alcance

Cuatro acciones de gestión + arreglo del cron:

1. **Cancelar** una campaña programada.
2. **Eliminar** una campaña (limpia las de prueba atascadas).
3. **Reprogramar** la fecha/hora de una campaña programada.
4. **Editar contenido** — vía *opción 1* (ver abajo): relanzar el wizard prefijado.
5. **Fix del cron** en prod para que las futuras programadas se disparen solas.

## Diseño

### 1. Modelo de datos

Nuevo valor de estado **`cancelled`**. No requiere migración de columnas (la columna
`status` es texto libre). Una campaña pasa a `cancelled` solo desde `draft`.

Sin cambios de esquema. Cualquier limpieza de datos de campañas de prueba existentes se
hace desde la nueva UI de eliminar (no por SQL manual).

### 2. Server actions (en `src/app/(app)/campanas/[id]/actions.ts`)

Todas: `requireOrg()` → cargar campaña → verificar `campaign.orgId === orgId` (si no,
`{ ok: false, error }`), luego mutar, luego `revalidatePath('/campanas')`.

- **`cancelCampaignAction(id: string)`**
  - Guard de estado: solo `status === 'draft'`. Otro estado → error claro.
  - Efecto: `status = 'cancelled'`.
  - Retorno: `{ ok: true } | { ok: false, error }`.

- **`deleteCampaignAction(id: string)`**
  - Guard de estado: estado ∈ `{ draft, cancelled, done, failed }`. **Nunca** `queued`
    ni `sending` (campaña activa) → error "No se puede eliminar una campaña en curso".
  - Efecto: `DELETE FROM campaigns WHERE id` → cascade borra `campaign_recipients`.
  - Retorno: `{ ok: true } | { ok: false, error }`.

- **`rescheduleCampaignAction(id: string, scheduledAtIso: string)`**
  - Guard de estado: solo `status === 'draft'`.
  - Validación de fecha: futura (misma regla que `createCampaignAction`:
    `new Date(iso).getTime() >= Date.now() - 60_000`), si no → error.
  - Efecto: `scheduledAt = new Date(iso)`.
  - Retorno: `{ ok: true } | { ok: false, error }`.

### 3. UI de gestión (sin tocar el wizard)

En `campanas/page.tsx`:

- Ampliar los filtros para que **los `draft` sin `scheduledAt`** también aparezcan en la
  sección "Programadas" (o una sección "Borradores") — hoy son invisibles. Concretamente:
  `scheduled = status === 'draft'` (con o sin `scheduledAt`); los que tengan fecha muestran
  cuándo corren, los que no, muestran "sin programar".
- Añadir `cancelled` a la sección "Finalizadas" con badge gris "Cancelada".
- En cada fila programada y en el detalle (`[id]/live.tsx` o `page.tsx`), un menú de acciones
  ("⋯", `DropdownMenu` Base-UI/shadcn ya en el repo) con **Reprogramar / Cancelar / Eliminar**.
  - **Reprogramar:** diálogo con `datetime-local` → `rescheduleCampaignAction`.
  - **Cancelar / Eliminar:** diálogo de confirmación → action correspondiente.
- Componentes cliente nuevos (los de la fila son server components); extraer un
  `campaign-actions.tsx` cliente que reciba `{ id, status, scheduledAt }` y renderice el menú.

### 4. Editar contenido — opción 1 (relanzar wizard prefijado)

"Editar" en una campaña `draft` navega a `/campanas/nueva?from=<id>`:

- `nueva/page.tsx` lee `?from`, carga la campaña draft del org (guard de propiedad) y pasa
  al wizard los valores precargables: `name`, `templateName`, `templateLanguage`,
  `templateType`, `componentPlanJson`, `scheduledAt`. **Los destinatarios no se precargan**
  (el usuario los reselecciona); es el trade-off aceptado de la opción 1.
- El wizard recibe un prop opcional `replacesDraftId`. Al crear con éxito, `createCampaignAction`
  recibe `replacesDraftId` y, tras crear la nueva campaña, **borra el draft origen** (mismo
  guard de propiedad/estado que `deleteCampaignAction`). Si el usuario abandona la edición, el
  draft original permanece intacto (puede eliminarlo manualmente). Esto evita pérdida de datos
  y duplicados al guardar.

### 5. Fix del cron en prod

Script idempotente `deploy/setup-cron.sh` (se corre una vez contra prod):

- Verifica/genera `CRON_SECRET` en `/opt/wa-blast/.env.local` (si falta, genera uno y lo
  añade; avisa que requiere reinicio del servicio para que Next lo lea).
- Instala:
  - `/etc/systemd/system/wa-blast-cron.service` — `Type=oneshot`,
    `ExecStart=/usr/bin/curl -fsS "http://127.0.0.1:3010/api/cron/run-scheduled?secret=${CRON_SECRET}"`
    (lee el secret de `EnvironmentFile=/opt/wa-blast/.env.local`).
  - `/etc/systemd/system/wa-blast-cron.timer` — `OnCalendar=*:0/1` (cada minuto),
    `Persistent=true`, `[Install] WantedBy=timers.target`.
- `systemctl daemon-reload && systemctl enable --now wa-blast-cron.timer`.
- Verificación: `systemctl list-timers wa-blast-cron` + un `curl` manual al endpoint que
  devuelva `{ ok: true }`.

El worker corre en proceso dentro del servidor Next (`getWorker` singleton), así que el timer
solo necesita golpear el endpoint HTTP local.

### 6. Limpieza de las campañas de prueba atascadas

Una vez desplegada la UI de eliminar, Luis (o nosotros con su OK) borra las campañas de
prueba desde la lista. No se requiere SQL manual contra prod.

## Pruebas (TDD, Vitest)

- `cancelCampaignAction`: éxito desde `draft`; rechazo desde `queued`/`sending`/`done`;
  rechazo si la campaña es de otro org.
- `deleteCampaignAction`: éxito desde `draft`/`cancelled`/`done`/`failed` y que borra los
  `campaign_recipients`; rechazo desde `queued`/`sending`; rechazo cross-org.
- `rescheduleCampaignAction`: éxito desde `draft` con fecha futura; rechazo con fecha pasada;
  rechazo desde estado no-`draft`; rechazo cross-org.
- `createCampaignAction` con `replacesDraftId`: crea la nueva y borra el draft origen; no borra
  si el draft es de otro org.
- Filtros de la lista: un `draft` sin `scheduledAt` aparece en "Programadas/Borradores";
  un `cancelled` aparece en "Finalizadas".

## Fuera de alcance

- Edición real in-place conservando el mismo ID (opción 2) — fase futura si se necesita.
- Precarga de destinatarios al editar.
- Pausar/reanudar campañas ya en curso (`sending`).
