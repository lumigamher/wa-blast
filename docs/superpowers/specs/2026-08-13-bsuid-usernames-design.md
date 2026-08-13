# Soporte de usernames de WhatsApp (BSUID) — diseño

Fecha: 2026-08-13
Estado: aprobado (secciones 1 y 2 con visto bueno; 3–5 escritas bajo la instrucción de terminar)

## Problema

Meta permite que un usuario de WhatsApp adopte un username (`@handle`) y esconda
su teléfono. Para esos usuarios el webhook **omite** el teléfono y entrega en su
lugar un *business-scoped user ID* (BSUID), con formato `US.13491208655302741918`.

Hoy Lula pierde esos mensajes, en silencio:

- `src/lib/meta/webhook.ts` declara `messages[].from`, `contacts[].wa_id` y
  `statuses[].recipient_id` como obligatorios (`z.string()`).
- `src/app/api/webhook/meta/route.ts:41` responde `200 OK` cuando la validación
  falla. Meta lo da por entregado y no reintenta.

Resultado: el mensaje no llega a ninguna tabla y nadie se entera. Los BSUID
llegan desde abril de 2026 y el envío por BSUID existe desde julio de 2026.

## Alcance

Dentro: recibir, identificar, responder y hacer campañas a clientes con username.

Fuera (decidido explícitamente):
- La Username API del propio negocio (`POST /<PHONE_NUMBER_ID>/username`). Es una
  feature comercial aparte, no un arreglo.
- La tabla `calls`. La API de llamadas de Meta no expone BSUID hoy; no se
  implementa soporte que no se puede probar.

## Sección 1 — Identidad y datos

### Esquema

| Tabla | Cambios |
|---|---|
| `contacts` | `+ bsuid`, `+ username`; `phone` → nullable; índice único `(org_id, bsuid)` |
| `conversations` | `+ bsuid`, `+ username`; `phone` → nullable; índice único `(org_id, bsuid)` |
| `campaign_recipients` | `+ bsuid`; `phone` → nullable |

El índice único por teléfono se conserva: SQLite trata cada `NULL` como distinto,
así que varios contactos sin teléfono conviven sin colisión.

### Reglas de vinculación

El webhook siempre trae BSUID; el teléfono solo a veces. Orden de resolución:

1. Buscar por BSUID. Si existe, completar `phone`/`username` si llegaron ahora y
   faltaban.
2. Si no existe por BSUID pero vino teléfono, buscar por teléfono. Si existe,
   **escribirle el BSUID**. Este paso evita duplicar un contacto conocido el día
   que adopta username.
3. Si no hay ninguno, crear.

Regla dura: **nunca sobrescribir un teléfono existente con `null`**. Que Meta deje
de enviarlo no significa que se perdió.

### Riesgo de migración

SQLite no puede quitar un `NOT NULL` con `ALTER TABLE`. Drizzle genera un
recreado completo (crear nueva, copiar, borrar, renombrar) sobre `contacts` y
`conversations`, que tienen llaves foráneas apuntándoles.

Mitigación obligatoria antes de tocar producción:
1. `deploy/backup-db.sh`.
2. Leer a mano el SQL generado por `drizzle-kit generate`, no confiar en él.
3. Contar filas de las 4 tablas antes y después y comparar.

## Sección 2 — Entrada y salida

### Webhook

`webhook.ts` se vuelve permisivo donde Meta ahora omite:

- `contacts[]`: `wa_id` opcional; `+ user_id`, `+ username`
- `messages[]`: `from` opcional; `+ from_user_id`
- `statuses[]`: `recipient_id` opcional; `+ recipient_user_id`

### Fin del descarte silencioso

Se sigue devolviendo 200 (si no, Meta reintenta en bucle y termina desactivando
el webhook), pero el payload que no valida se persiste en una tabla nueva
`webhook_drops` (payload crudo + error de zod + timestamp), con retención corta
porque contiene datos personales. El conteo se muestra en `/salud`.

Esto convierte una pérdida invisible en una alerta visible el mismo día.

### Handler

`webhook-handlers.ts:69` hace hoy `const phone = "+" + msg.from...`, que revienta
sin teléfono. Pasa a construir una `Identity` (`{bsuid, phone?, username?}`) y
delegar en `resolveContactAndConversation()`, único lugar del sistema que aplica
las reglas de vinculación.

### Envío

Las cinco funciones de `src/lib/meta/client.ts` (`sendText`, `sendTemplate`,
`sendFlow`, `sendMedia`, `sendReaction`) dejan de recibir `to: string` y reciben
un `Recipient`. Un helper único traduce al cuerpo del request:

- hay teléfono → `to`
- solo BSUID → `recipient`
- ninguno → error explícito

Se prefiere el teléfono cuando existe: Meta dice que gana si se mandan ambos, así
que no hay ambigüedad, y el comportamiento del tráfico actual queda intacto.

`AgentSender` en `turn.ts` cambia igual, que es como el agente responde a alguien
sin teléfono.

### Estados

El cruce de campañas es por `wamid` y sigue igual. Solo hay que tolerar
`recipient_id` ausente y caer a `recipient_user_id`.

## Sección 3 — Campañas

`campaign_recipients` gana `bsuid` y su `phone` pasa a nullable. Un destinatario
sin teléfono solo puede provenir de un contacto ya conocido: no se puede escribir
un BSUID a mano ni subirlo por CSV, porque el BSUID solo existe si esa persona ya
te escribió. La UI de armado de campaña debe reflejar eso — un contacto sin
teléfono es seleccionable desde segmentos, no desde carga manual.

Las plantillas se envían con `Recipient`, igual que el resto.

## Sección 4 — UI

Un helper único `displayIdentity(contact)` decide qué se ve:

1. nombre del contacto, si hay
2. `@username`, si hay
3. teléfono, si hay
4. BSUID abreviado como último recurso

Los ~40 archivos que hoy leen `.phone` para mostrar pasan a usar ese helper. No
cambian lógica; solo dejan de asumir que el teléfono existe.

## Sección 5 — Pruebas y despliegue

### Pruebas

- Webhook: payload con teléfono (regresión), payload solo-BSUID, payload con
  ambos, payload con username. Ninguno se descarta.
- Vinculación: los tres caminos de resolución + la regla de no sobrescribir con
  null + no duplicar un contacto conocido que adopta username.
- Envío: `Recipient` con teléfono → `to`; solo BSUID → `recipient`; vacío → error.
- `webhook_drops`: un payload inválido queda registrado y responde 200.
- Regresión: la suite completa debe seguir verde — es la validación de que las
  integraciones actuales no se rompieron.

### Despliegue

1. Backup de la base de producción.
2. Verificar conteos de filas antes/después de la migración.
3. Desplegar con la cadena desacoplada (`setsid nohup`), porque `deploy.sh` corre
   el build por SSH en primer plano y una desconexión deja `.next` a medias.
4. Verificar con `BUILD_ID` + `ActiveEnterTimestamp`, no con el health check: el
   proceso viejo sigue devolviendo 200 desde memoria.

## Orden de implementación

Cada fase deja el árbol verde y desplegable:

- **Fase A** — esquema + migración + reglas de vinculación (con tests)
- **Fase B** — webhook permisivo + `webhook_drops` + handler por `Identity`
- **Fase C** — `Recipient` en el cliente de Meta y en `AgentSender`
- **Fase D** — campañas y UI
