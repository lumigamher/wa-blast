# Fase 1 · Hotfix de la auditoría (2026-10-25)

Spec: hallazgos verificados de la auditoría de código del 25-oct-2026 (resumen en cada tarea).
Rama: `fix/fase1-hotfix` (desde `main` @ d9d2078).

## Global Constraints

- Cambios mínimos y quirúrgicos: NO reformatear archivos enteros, NO correr `biome format`/`biome check --write`
  (el repo no usa Biome; el linter es ESLint). Respetar el estilo, idioma (comentarios en español) y nombres
  del código vecino.
- NO crear migraciones de base de datos en esta fase (nada en `drizzle/`). NO tocar producción, NO deploy, NO push.
- TDD: cada cambio de comportamiento lleva un test que falla antes y pasa después. Tests junto al código
  (`*.test.ts`) siguiendo el patrón existente (`makeTestDb()` de `src/lib/db/test-db.ts`).
- Comandos (usar EXACTAMENTE estos; el Node del PATH por defecto no coincide con el binario de better-sqlite3):
  - Tests: `PATH=/opt/homebrew/bin:$PATH npx vitest run <archivos>` y al final la suite completa
    `PATH=/opt/homebrew/bin:$PATH npx vitest run` (línea base: 155 archivos, 758 tests, todo verde).
  - Tipos: `PATH=/opt/homebrew/bin:$PATH npx tsc --noEmit -p .` (línea base: limpio).
  - Lint: `PATH=/opt/homebrew/bin:$PATH npx eslint <archivos tocados>` (sin errores nuevos).
- Commits: Conventional Commits en español, estilo del repo (`fix(area): ...`), terminando con
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Un commit por tarea (o pocos). No commitear
  `scripts/_tmp-seed-*.mjs` (archivos sin rastrear ajenos a esta tarea).
- Multi-tenant: toda consulta/escritura que toque datos de una org debe filtrar por `orgId`.

## Task 1: Campañas a BSUID: persistir `bsuid` en los destinatarios

Problema: `createCampaign` (`src/lib/campaigns/create.ts`, insert en ~líneas 61-70) recibe `bsuid` en cada
destinatario (el tipo lo acepta en la línea 18) pero NO lo inserta en `campaign_recipients`. El worker
(`src/lib/campaigns/worker.ts:138,161`) envía con `rec.bsuid` → llega null junto con phone null → toda fila de
un contacto con username falla. Igual `retryFailedAction` (`src/app/(app)/campanas/[id]/actions.ts` ~líneas
17-50) re-crea destinatarios sin pasar `bsuid`. Y `findRecentDuplicate` (`src/app/(app)/campanas/nueva/actions.ts`
~líneas 71 y 200) ignora a los destinatarios BSUID: revisar y, si es un cambio pequeño, incluir bsuid en la
comparación.

Hacer:
1. Insertar `bsuid: r.bsuid ?? null` en el insert de `createCampaign` (verificar que la columna existe en
   `campaignRecipients` del schema; existe porque `webhook-handlers.ts:110` la consulta).
2. `retryFailedAction` debe copiar `bsuid` de las filas fallidas al reintentar.
3. Tests: `createCampaign` con un destinatario solo-bsuid (phone null) deja la fila con bsuid; un test del
   reintento si la acción es testeable sin Next (si no, extraer la construcción de destinatarios a una función
   pura en `src/lib/campaigns` y testear esa).

## Task 2: Webhook: no perder mensajes ni estados si el procesamiento falla, y no redisparar el agente con duplicados

Problema: en `src/lib/meta/webhook-handlers.ts` el evento de dedupe ("replied", ~líneas 85-96) se inserta ANTES
de guardar el mensaje (`recordInboundMessage`, ~línea 130). Si guardar lanza (p. ej. SQLITE_BUSY), el POST
devuelve 500, Meta reintenta, y en el reintento `inserted.length === 0` hace return → el mensaje se pierde para
siempre. Lo mismo para statuses (evento ~línea 20, efecto ~línea 33). Además, cuando `recordInboundMessage`
(`src/lib/inbox/store.ts` ~50-63) detecta un wamid duplicado devuelve el `conv.id` igual y el handler vuelve a
llamar `maybeDispatchAgentTurn` (~línea 139) → el agente puede responder dos veces a una reentrega.

Requisito (comportamiento, no implementación): si el procesamiento de un mensaje entrante o de un status lanza
una excepción, una reentrega posterior del MISMO webhook debe procesarlo completo (mensaje guardado, contadores
de campaña aplicados una sola vez). Un webhook que ya se procesó con éxito, al reentregarse, no debe duplicar
mensajes, ni contadores, ni disparar el agente otra vez.

Enfoque sugerido (el implementador puede elegir otro equivalente): mover el insert del evento de dedupe al
FINAL, después de que los efectos tuvieron éxito, o envolver evento+efectos sincrónicos en una transacción
(better-sqlite3: las transacciones de Drizzle son síncronas, no se puede `await` adentro). Para que no queden
dobles efectos en una carrera, los efectos deben ser idempotentes: `recordInboundMessage` debe devolver además
una señal `duplicate: boolean` y el handler NO debe despachar el agente ni sumar `replied` cuando es duplicado.
NO agregar índices únicos ni migraciones (fase 2).

Tests (nuevos, en `src/lib/meta/webhook-handlers.test.ts` o similar): (a) reentrega tras éxito → 1 mensaje, agente
despachado 1 vez (inyectar/espiar el dispatch como permita el código), contador replied +1 una sola vez;
(b) primer intento falla en `recordInboundMessage` (simular la excepción) y la reentrega sí guarda el mensaje;
(c) lo equivalente para un status (fallo en el efecto → la reentrega aplica el status).

## Task 3: Tools del agente: pedidos acotados a la organización y a la conversación

Problema (IDOR / prompt injection): el `orderId` de estas tools lo pone el LLM, o sea cualquier cliente final.
- `src/lib/agent/tools/builtin/enviar-checkout.ts` (~líneas 35-40) busca el pedido por `orders.id` SIN `orgId`
  → puede cobrar/enviar el pedido de otra organización.
- `src/lib/agent/payments/register.ts` (`registrarPago`, líneas 28-54): si llega `orderId` solo filtra por org,
  no por conversación → un cliente puede marcar "pagado" el pedido de OTRO contacto de la misma org.
- `src/lib/agent/payments/link.ts` (`generarLinkPago`, líneas 7-20): mismo hueco con `orderId`.

Hacer: cuando el modelo pasa `orderId`, la búsqueda debe exigir `orders.orgId = ctx.orgId` Y
`orders.conversationId = <conversación actual>`; si no coincide, devolver el error amable existente del tool
("No hay un pedido ...") como si no existiera. El camino sin `orderId` ya filtra por conversación: dejarlo.
NO cambiar el estado al que se pasa el pedido (sigue "pagado"); eso es decisión de producto de otra fase.
Revisar en `src/lib/agent/tools/builtin/` si otra tool busca pedidos por id sin org/conversación
(`grep -n "orders.id" src/lib/agent`) y aplicar el mismo arreglo; listar en el reporte cuáles revisaste.

Tests: para cada tool/función tocada, un pedido de otra org y un pedido de otra conversación de la misma org
NO se pueden usar (resultado de error, pedido intacto en la DB); el pedido propio sí. Hay tests existentes
(`registrar-pago.test.ts` con caso multi-tenant) para seguir su patrón.

## Task 4: Medios: impedir XSS almacenado en `/media/[id]` y `/api/inbox/media/[mediaId]`

Problema: `src/app/media/[id]/route.ts` es público y sirve `content-type: asset.mime`, mime que viene de
`file.type` controlado por el cliente al subir. Un `.html` (o `image/svg+xml`) subido se ejecuta en el mismo
origen de la app. Revisar también `src/app/api/inbox/media/[mediaId]/route.ts`.

Hacer: una función pura compartida (p. ej. `src/lib/media/serve-headers.ts`) que, dado el mime guardado,
devuelva los headers seguros:
- Mime "inline-seguro" (lista blanca): `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `audio/*`,
  `video/*`, `application/pdf` → se sirve con ese content-type.
- Cualquier otro (incluye `text/html`, `image/svg+xml`, `application/xhtml+xml`, `text/xml`, `application/javascript`,
  mime vacío o raro) → `content-type: application/octet-stream` + `content-disposition: attachment`.
- Siempre: `x-content-type-options: nosniff` y `content-security-policy: sandbox; default-src 'none'`
  (para el PDF/imagen no estorba; para cualquier cosa que el navegador intente renderizar, la aísla).
- Conservar `content-length` y el `cache-control` actual de cada ruta.
Usarla en ambas rutas. Tests unitarios de la función (html, svg, xhtml, vacío → attachment+octet-stream;
jpeg, pdf, audio/ogg → inline con su tipo; mayúsculas/parámetros tipo `image/PNG; charset=x` normalizados).
NO cambiar cómo se suben los archivos en esta tarea.

## Task 5: `requireOrg`: un miembro eliminado pierde el acceso

Problema: `src/lib/auth/session.ts` (`requireOrg`, ~líneas 18-29) confía en `session.session.activeOrganizationId`
sin comprobar que exista la fila en `member` (userId + organizationId). Un miembro expulsado conserva sus otras
sesiones con acceso total a la org.

Hacer: si hay `activeOrganizationId`, verificar en `member` que el usuario siga siendo miembro de esa org. Si no
lo es, caer al mismo camino que cuando no hay org activa (primera membresía del usuario; si no tiene ninguna →
`redirect("/login")`). Mantener la firma y el retorno. Para testear sin Next, extraer la resolución a una
función pura con `db` inyectado (p. ej. `resolveOrgForUser(db, userId, activeOrgId)`) y testearla con
`makeTestDb()`: miembro vigente → su org; org activa sin membresía → cae a otra membresía; sin membresías → null.
Revisar si `getOrgId`/otros helpers del mismo archivo o de `src/lib/org` repiten el patrón y aplicar lo mismo.

## Task 6: SQLite y deploy: `busy_timeout` y backup antes de migrar

Problema: `src/lib/db/client.ts` solo fija `journal_mode = WAL` y `foreign_keys = ON`; sin `busy_timeout`,
cualquier escritura concurrente (migración del deploy, backup, script) falla al instante con SQLITE_BUSY.
`deploy/deploy.sh` (~línea 25) corre `bun run db:migrate` sin backup previo de la DB.

Hacer:
1. En `client.ts` agregar `sqlite.pragma("busy_timeout = 5000")` y `sqlite.pragma("synchronous = NORMAL")`
   (seguro con WAL). Si `src/lib/db/test-db.ts` u otro sitio crea conexiones de producción, igual.
2. En `deploy/deploy.sh`, justo antes de `bun run db:migrate`, un backup consistente con
   `sqlite3 "$DB" ".backup '<ruta>-pre-migrate-<fecha>.db'"` usando la MISMA ruta de DB que usa el servicio
   (leer `deploy/backup-db.sh` y `.env`/`DATABASE_URL` de cómo se resuelve en el servidor; si la ruta no se
   puede deducir con certeza, leer `DATABASE_URL` del `.env.local` de `/opt/wa-blast` dentro del mismo comando
   remoto). Si el backup falla, el deploy debe abortar ANTES de migrar (`&&` o `set -e`). Conservar solo los
   últimos 5 backups pre-migrate.
3. NO ejecutar el script ni conectarse al servidor. Validar sintaxis con `bash -n deploy/deploy.sh`.
Tests: un test que verifique que la conexión de `client.ts` queda con `busy_timeout` 5000 solo si es factible
sin efectos secundarios (el cliente abre `env.DATABASE_URL`); si no, omitirlo y explicarlo en el reporte.
