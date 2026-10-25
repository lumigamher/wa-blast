# Fase 2 · Robustez (webhook, agente, campañas, índices)

Origen: `docs/superpowers/plans/2026-10-25-fase2-backlog.md`, sección "Primero". Sin spec aparte: este plan y el backlog son la autoridad.
Rama: `fix/fase2-robustez` (desde `main` 6e77c83, ya desplegado).

## Global Constraints
- better-sqlite3 + Drizzle: las transacciones son SINCRÓNICAS (`db.transaction((tx) => { ... .run() })`), nunca `await` dentro.
- Tests: `PATH=/opt/homebrew/bin:$PATH npx vitest run <ruta>` (better-sqlite3 está compilado para el Node de Homebrew). Typecheck: `npx tsc --noEmit`. Lint: `npx eslint <archivos>`.
- Tests con `makeTestDb()` de `src/lib/db/test-db.ts` (aplica las migraciones de `drizzle/migrations`).
- Migraciones: editar el schema en `src/lib/db/schema/*.ts` y generar con `npx drizzle-kit generate` (nunca escribir SQL a mano salvo que drizzle no pueda expresarlo; si se edita el SQL generado, explicarlo en el reporte). Nada de recrear tablas: solo `CREATE INDEX`/`CREATE TABLE` aditivos.
- Multi-tenant: toda consulta nueva filtra por `orgId`.
- Comentarios y mensajes en español, estilo del código vecino. Sin dependencias nuevas.
- No tocar `scripts/_tmp-seed-*.mjs` (sin trackear, nunca se commitean).
- Producción (1 org, 7 conversaciones, 203 mensajes) no tiene duplicados de `(org_id, wamid)` en messages ni de `(user_id, organization_id)` en member (verificado el 25-oct).
- Commits pequeños con mensaje convencional en español.

## Task 1: Webhook · atribución por org y ranking de estados
Archivos: `src/lib/meta/webhook-handlers.ts`, `src/lib/inbox/store.ts`, tests vecinos (`webhook-handlers.test.ts` o el que ya exista para estos handlers; `store.test.ts`).

1. **Atribución `replied` por org.** En `handleInboundMessage`, la búsqueda `recent` en `campaignRecipients` debe hacer `innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))` y filtrar `eq(campaigns.orgId, orgId)`. Test: un celular recibió campaña de la org A; escribe a la org B → `replied` de la campaña de A sigue en 0. Y el caso positivo en la misma org sigue sumando 1.
2. **Ranking de estados de campaña.** Rango: `pending=0, sent=1, delivered=2, read=3`; `failed` es terminal y solo aplica si el estado actual es `pending` o `sent`. En `handleStatusEvent`, actualizar `campaignRecipients.status` y sumar el contador SOLO si el nuevo estado tiene rango mayor que el actual (o es `failed` permitido). Un `delivered` que llega después de `read` no retrocede ni suma. Un `read` que llega sin `delivered` previo suma `read` (no inventa `delivered`). Exportar la función pura de ranking (`shouldAdvanceStatus(current, next): boolean`) en un módulo pequeño `src/lib/meta/status-rank.ts` con su test.
3. **Mismo ranking en el inbox.** `updateMessageStatusByWamid` recibe `orgId` (la firma pasa a `(db, orgId, wamid, status, errorMessage?)`; actualizar los llamadores) y no retrocede el estado de `messages` (usar la misma función; leer el estado actual y actualizar solo si avanza). Filtra por `orgId`.
4. Mantener el gate atómico y el manejo de errores existente (delete del claim en catch).

## Task 2: Índices únicos y migración con busy_timeout
Archivos: `src/lib/db/schema/domain.ts`, `src/lib/db/schema/auth.ts`, migración generada en `drizzle/migrations`, `package.json`, nuevo `scripts/migrate.ts` (o `.mjs`), `src/lib/inbox/store.ts` si hace falta.

1. `messages`: reemplazar el índice `messages_org_wamid` por `uniqueIndex("messages_org_wamid").on(t.orgId, t.wamid).where(sql\`wamid is not null\`)`. Si drizzle-kit no emite el `WHERE`, editar el SQL generado para que el índice sea parcial y explicarlo.
2. `conversations`: `index("conversations_org_last_msg").on(t.orgId, t.lastMessageAt)`.
3. `member`: `uniqueIndex("member_user_org").on(t.userId, t.organizationId)`.
4. Verificar que la migración generada solo tenga `DROP INDEX`/`CREATE INDEX` (sin `__new_` ni recreación de tablas).
5. `recordInboundMessage` y `recordOutboundMessage`: si el insert choca con el índice único (carrera), no lanzar: tratarlo como duplicado (`onConflictDoNothing` no aplica a índices parciales en todas las versiones; si no funciona, capturar `SQLITE_CONSTRAINT_UNIQUE` y devolver `duplicate: true`). Test de la carrera: insertar dos veces el mismo `(orgId, wamid)` vía la función → una fila, sin excepción.
6. `db:migrate` deja de usar `drizzle-kit migrate` y pasa a un script que abre la DB con los mismos pragmas de `src/lib/db/client.ts` (`busy_timeout = 5000`, WAL) y llama `migrate()` de `drizzle-orm/better-sqlite3/migrator` con `migrationsFolder: "drizzle/migrations"`. Debe correr en producción con `bun run db:migrate` desde `/opt/wa-blast` y leer `DATABASE_URL` del entorno (el deploy hace `set -a && . ./.env.local`). Reutilizar `runMigrations()`/el cliente si es posible sin importar código de Next. Probarlo localmente contra una copia: `cp .data/wa-blast.db $SCRATCH/m.db && DATABASE_URL=$SCRATCH/m.db bun run db:migrate` (si `.data/wa-blast.db` no existe, crear una DB vacía y migrar dos veces: la segunda debe ser no-op).

## Task 3: Cola durable del agente con lock por conversación
Archivos: `src/lib/db/schema/domain.ts` (+ migración), `src/lib/agent/queue.ts`, `src/lib/agent/dispatch.ts`, `src/app/api/cron/run-scheduled/route.ts` (solo agregar el barrido), tests.

Hoy `queue.ts` es un debounce en memoria: un deploy pierde los turnos pendientes y dos turnos de la misma conversación pueden correr a la vez.

1. Tabla `agent_jobs`: `conversationId` (PK, FK conversations cascade), `orgId` (FK organization cascade), `recipientJson` (text, el `Recipient`/teléfono serializado), `dueAt` (timestamp), `lockedUntil` (timestamp, null), `attempts` (int default 0), `updatedAt`. Índice `(dueAt)`.
2. `enqueueAgentTurn(db, {orgId, conversationId, recipient}, delayMs)`: upsert con `dueAt = now + delayMs` (el debounce se reinicia con cada mensaje; `attempts` vuelve a 0) y programa un `setTimeout` en memoria para `delayMs` que llama `runAgentJob(conversationId)`. El timer es solo latencia; la verdad está en la tabla.
3. `claimAgentJob(db, conversationId, now)`: un `UPDATE ... SET lockedUntil = now + 180s, attempts = attempts + 1 WHERE conversationId = ? AND dueAt <= now AND (lockedUntil IS NULL OR lockedUntil < now) RETURNING *`. Si no devuelve fila, no corre (otro proceso o el debounce aún no vence).
4. Al terminar el turno (éxito o error): `DELETE WHERE conversationId = ? AND dueAt = <dueAt reclamado>`; si no borró nada (llegó un mensaje nuevo mientras corría), poner `lockedUntil = null` y reprogramar el timer para `max(0, dueAt - now)`. Si el turno lanzó y `attempts >= 3`, borrar el job y `console.error("[agent] job descartado tras 3 intentos", ...)`; si `attempts < 3`, liberar el lock y dejar que el cron lo reintente.
5. `sweepAgentJobs(db, now)`: lista los jobs vencidos y sin lock vigente (límite 20) y corre `runAgentJob` para cada uno. Se llama desde el `GET` del cron (`run-scheduled`, corre cada minuto en producción vía systemd timer), sin esperar a que terminen (`void`), y su resultado se agrega a la respuesta JSON (`agentJobs: n`).
6. `dispatch.ts`: `maybeDispatchAgentTurn` encola con la nueva API; `runRealTurn` se ejecuta dentro de `runAgentJob` (reclamo → turno → liberación). Mantener la inyección `deps.enqueue` para tests o reemplazarla por una equivalente.
7. Tests: debounce (dos encolados seguidos → un solo turno), lock (dos `runAgentJob` concurrentes → un solo turno), mensaje nuevo durante el turno → corre un segundo turno después, recuperación (job vencido sin timer → `sweepAgentJobs` lo corre), descarte tras 3 fallos, aislamiento por org en el barrido (el turno se corre con el `orgId` del job). Usar timers falsos de vitest donde haga falta.

## Task 4: Campañas que no se reenvían ni se quedan colgadas
Archivos: `src/lib/campaigns/worker.ts`, `src/app/api/cron/run-scheduled/route.ts`, tests (`worker.test.ts`, test de la ruta si existe).

1. **Reserva atómica por fila.** Antes de enviar a cada destinatario: `UPDATE campaign_recipients SET status = 'sending' WHERE id = ? AND status = 'pending' RETURNING id`; si no se reservó, saltarla. Así dos workers sobre la misma campaña nunca envían dos veces a la misma fila.
2. **Heartbeat.** Durante el bucle, actualizar `campaigns.statusChangedAt = now` como máximo cada 15 s (y al iniciar).
3. **Recuperación.** En la ruta del cron: `STUCK_MS` pasa a 10 min. `recoverStuckCampaigns` recupera `sending` con heartbeat vencido Y también `queued` con `statusChangedAt` vencido (quedaron reclamadas pero el proceso murió antes de empezar). Al recuperar una campaña, sus filas en `sending` (envío interrumpido: no sabemos si Meta lo aceptó) pasan a `failed` con `error = "Envío interrumpido; revisa antes de reintentar"` y suman a `failed` (no se reenvían solas: se pueden reintentar desde el botón existente). Las `pending` siguen y el cron vuelve a correr la campaña.
4. **Opt-out al enviar.** Justo antes de cada envío, verificar que el contacto de la org (por `phone` o `bsuid`, igual que en el webhook) no tenga `optOutAt`; si lo tiene, la fila queda `failed` con `error = "El contacto se dio de baja"`, suma `failed`, sin llamar a Meta.
5. **130429 (límite de Meta).** Si el envío devuelve `error.code === 130429` (o 131056, par por número), reintentar la misma fila con espera 2 s, 4 s, 8 s (máx 3 reintentos) antes de marcarla `failed`. La espera debe ser inyectable para tests (p. ej. un `sleep` en el constructor o en deps).
6. Tests: reserva (fila ya en `sending` no se envía), opt-out, backoff 130429 (falla dos veces, luego éxito → `sent`), recuperación de `queued` y `sending` vencidas con filas `sending` → `failed`, heartbeat actualiza `statusChangedAt`.
