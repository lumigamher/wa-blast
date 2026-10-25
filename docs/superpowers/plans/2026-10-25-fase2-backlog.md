# Fase 2 · Backlog que dejó la Fase 1 (2026-10-25)

Origen: la auditoría del 25-oct y las revisiones de la rama `fix/fase1-hotfix`. Ordenado por prioridad.

## Primero
- **Atribución de `replied` entre tenants.** `webhook-handlers.ts` (búsqueda `recent`) busca en `campaign_recipients`
  por teléfono/bsuid sin filtrar por org. Si un celular recibió una campaña de la org A y luego escribe a la org B,
  se suma +1 a la campaña de A. Hay que hacer `innerJoin(campaigns)` con `campaigns.orgId = orgId`.
- **Cola durable del agente + lock por conversación.** Hoy `agent/queue.ts` es un debounce en memoria: un deploy pierde
  turnos y dos turnos pueden correr en paralelo (doble respuesta o doble pedido). También hace falta un mecanismo
  para que un crash entre el gate del webhook y el final no pierda el evento.
- **Campañas:** heartbeat de `statusChangedAt`, reserva atómica por fila (pending→sending), recuperar las que quedaron
  en `queued`, revalidar el opt-out al enviar y reintentar con backoff ante 130429.
- **Índices y migración:** único `(org_id, wamid)` parcial en `messages`, `(org_id, last_message_at)` en `conversations`,
  `(user_id, organization_id)` en `member`. Revisar que `PRAGMA foreign_keys=OFF` dentro de la transacción de
  drizzle no dispare cascadas al recrear tablas: probar contra una copia de la DB de producción.
- **Ranking de estados:** un status fuera de orden (delivered después de read) no debe retroceder el estado ni sumar.

## Seguridad y planes (Fase 3 del informe)
- Gate de plan por módulo en las server actions, y en `maybeDispatchAgentTurn`. Roles owner/admin para credenciales,
  facturación y borrados.
- SSRF: conectores HTTP, `customBaseUrl` del gateway, fotos de catálogo, reenvío de webhooks (`redirect: "manual"`).
- Validar el monto en el webhook de EfiPay. Cron con `Authorization: Bearer` + `timingSafeEqual`.
- Decisión de producto pendiente (Luis): `registrar_pago` hoy deja el pedido en "pagado" con solo la palabra del cliente.
  ¿Pasarlo a "por verificar" hasta que lo confirme una persona?

## Limpieza (minors de las revisiones)
- Campañas: mover el test de `failedRowsToRecipients` a `retry.test.ts`; test de `findRecentDuplicate`; renombrar
  `phones`; `JSON.parse` con try en `retry.ts`.
- Webhook: wrappers async `recordFlowResponse`/`enrichContactFromFlow` sin llamadores; test del fallo del delete del
  claim en status y de la atomicidad de la rama flow.
- `drizzle-kit migrate` sin `busy_timeout`: migrar con `runMigrations()` de `client.ts`.
- Medios: conservar `codecs=` en audio y video; agregar `image/heic` a la lista si hace falta; tests de mimes raros.
- `requireOrg`: `orderBy` en el fallback de membresía y un mensaje para el expulsado sin otras orgs.
- Formato de WhatsApp: `***x***`, URLs con paréntesis en `[t](url)`, sangría de listas, cita vacía, `findClose`
  cuadrático con muchos marcadores sin cierre.
- Entorno: fijar la versión de Node (local 25, PATH con 24 de OpenClaw, producción 22), decidir entre Biome y ESLint,
  agregar el script `typecheck`, quitar dependencias sin uso (`puppeteer`, `playwright`, `react-email`,
  `@vitest/ui`), reemplazar `xlsx`, quitar el log `[MEDIA-DBG]`.
