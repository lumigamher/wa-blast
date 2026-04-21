# Funes-blast: crear plantillas, filtros, auto-etiquetado

**Fecha:** 2026-04-18
**Proyecto:** `/opt/funes-blast` (Next.js 16 + Bun + Chatwoot v4.13 en `funes.luladev.com`)
**Estado actual tras hotfix:** envíos funcionan (plantilla `funes_bienvenida` ok, rate limit resuelto, reconciliador de estado real contra Chatwoot)

## Objetivo

Tres features sobre el módulo de mensajería masiva:

1. Crear plantillas de WhatsApp directamente desde la app (Meta Graph API)
2. Auto-etiquetar conversaciones entrantes de pruebas neuropsicológicas
3. Filtrar destinatarios de envíos masivos por etiquetas / fecha / combinaciones

---

## Feature 1 — Crear plantillas de WhatsApp

### UX

- Nueva ruta `/plantillas/nueva` (el módulo `/plantillas` hoy solo lista).
- Form con:
  - `nombre` (snake_case, regex `^[a-z0-9_]+$`)
  - `idioma` (default `es_CO`, select con es_CO/es_ES/es_MX/en_US)
  - `categoría` (`UTILITY` / `MARKETING` / `AUTHENTICATION`)
  - `header` opcional (TEXT, hasta 60 chars, con o sin variable)
  - `body` obligatorio (hasta 1024 chars, variables `{{1}}..{{n}}` + bloque de ejemplos por variable)
  - `footer` opcional (hasta 60 chars, sin variables)
  - `buttons` opcional: hasta 3 QUICK_REPLY o 2 URL
- **Preview en vivo** en burbuja WhatsApp (reuso del estilo de `/plantillas`).
- Botón "Enviar a Meta para aprobación":
  - Valida con Zod
  - `POST https://graph.facebook.com/v20.0/{WABA_ID}/message_templates` con header `Authorization: Bearer {META_TOKEN}`
  - Muestra estado `PENDING` y link a Meta Business para seguimiento
- Botón "Sincronizar desde Meta" en `/plantillas` → hace `POST /api/chatwoot/sync-templates` (server action) que dispara resync en Chatwoot vía Rails runner o endpoint interno.

### Backend

- Nuevo módulo `src/lib/meta.ts`:
  ```ts
  export const metaApi = {
    createTemplate(input): Promise<{ id, status }>,
    getTemplate(name): Promise<MetaTemplate | null>,
    syncChatwoot(): Promise<void>, // llama a Chatwoot
  }
  ```
- Nuevas env vars (ya validadas por zod en `src/lib/env.ts`):
  - `META_WABA_ID` — Business Account ID
  - `META_ACCESS_TOKEN` — token de System User con `whatsapp_business_management`
- Server action `createTemplateAction(input)` en `/plantillas/nueva/actions.ts` — auth + zod + call Meta.
- Sync Chatwoot: llamada a Graph (refresh) + trigger del job `Whatsapp::ResyncTemplatesJob` dentro de Chatwoot. Como no podemos meter código en Chatwoot, usamos endpoint `POST /api/v1/accounts/{id}/inboxes/{id}/sync` si existe, o workaround: `docker exec chatwoot-rails-1 rails runner "Channel::Whatsapp.find(2).sync_templates"` desde un endpoint de funes-blast que shell-exec docker. **Decisión:** evitamos exec a docker por seguridad. Usaremos `GET /api/v1/accounts/{id}/inboxes/{id}` (endpoint oficial, trigger implícito) y si Chatwoot no refresca, el sync automático lo hará en ~6h. Para forzar refresh manual documentamos el comando Rails.

### Errores

- `#100` nombre duplicado → error visible
- Token inválido → aviso de "configura META_ACCESS_TOKEN"
- Validación Meta: structured errors se muestran completos

### Tests

- Unit: validador de nombre, variables, botones
- E2E light: crear template dummy (con token de sandbox) → verificar que aparece en `listTemplates` al 24-48h (manual)

---

## Feature 2 — Auto-etiquetado

### Trigger

- Chatwoot dispara webhook `POST https://blast.funes.luladev.com/api/webhooks/chatwoot` en eventos:
  - `message_created` (filtrado a `incoming`, solo primer mensaje de la conversación)
- Registrado vía UI de Chatwoot (Settings → Integrations → Webhooks) con signing secret en env `CHATWOOT_WEBHOOK_SECRET`.

### Lógica

- Endpoint `src/app/api/webhooks/chatwoot/route.ts`:
  - Valida firma (header `X-Chatwoot-Hmac-Signature`, HMAC-SHA256 sobre body con secret)
  - Si `event = message_created && message_type = incoming && is_first_message`:
    - Normaliza contenido (lowercase, sin tildes)
    - Busca coincidencia contra regla activa
    - Si matchea, aplica label al conversation vía `POST /api/v1/accounts/{id}/conversations/{id}/labels` con `{"labels":["pruebas-neuropsicologicas"]}` usando `CHATWOOT_ADMIN_TOKEN` (nueva env var, token de admin bot).

### Config

- Tabla `keyword_rules`:
  ```sql
  CREATE TABLE keyword_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    keywords TEXT NOT NULL,       -- CSV, normalizados
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  ```
- Seed inicial:
  ```
  name: 'Pruebas neuropsicológicas'
  keywords: 'prueba,pruebas,neuropsicologica,neuropsicologicas,wisc,wais,tdah,evaluacion cognitiva'
  label: 'pruebas-neuropsicologicas'
  ```
- UI en `/configuracion/auto-etiquetas`: tabla + form para editar keywords y activar/desactivar regla.

### Primera-vez gate

- "Primer mensaje" = `conversation.messages.count` = 1 en el evento o `conversation.created_at` está dentro de 60s del `message_created`.

### Errores

- Webhook timeout > 5s → Chatwoot reintenta; nuestro handler debe ser idempotente (si label ya existe, no-op).
- Firma inválida → 401 sin procesar.

---

## Feature 3 — Filtros en wizard de envío

### UX

- En `src/app/(app)/nuevo-envio/wizard.tsx`, tab "Chatwoot" ya existe. Agrego **panel de filtros** arriba:
  - Multi-select de **etiquetas** (pobladas desde `GET /api/v1/accounts/{id}/labels`) + toggle AND/OR
  - **Fecha de última actividad**: preset (7/30/90d / custom range)
  - **Estado**: abierta / pendiente / resuelta / snoozed (checkboxes, default todas)
  - **Inbox**: por defecto `CHATWOOT_INBOX_ID`, mostrable si hay otros
- Botón "Aplicar" pobla la lista (ya existente) con contactos únicos cuyas conversaciones cumplen el filtro.

### Backend

- Nuevo endpoint `GET /api/conversations/filter`:
  - Params: `labels[]`, `labels_mode` (and/or), `since`, `before`, `status[]`
  - Llama a Chatwoot `POST /api/v2/accounts/{id}/reports/conversations_filter` (endpoint oficial de filtros custom).
  - Itera paginación hasta 5 páginas (límite 125 conv × 5 = 625). Agrega límite duro.
  - Deduplica `contact_id` → devuelve `{contacts: ChatwootContact[], total}`.
- Caché de 30s en memoria por query para evitar re-pegarle al API entre interacciones.

### Edge cases

- Si el filtro devuelve > 500 contactos, mostrar warning y permitir "incluir todos" con confirmación.
- Si labels AND, API de Chatwoot no soporta AND nativamente → hacer queries por label y calcular intersección client-side.

---

## Orden de implementación

1. Feature 1 (Crear plantillas) — destraba iteración
2. Feature 3 (Filtros) — depende solo de labels ya existentes
3. Feature 2 (Auto-etiquetado) — requiere webhook público + reglas persistentes + UI de config

## Env vars nuevas (`.env.local`)

```
META_WABA_ID=
META_ACCESS_TOKEN=
CHATWOOT_ADMIN_TOKEN=
CHATWOOT_WEBHOOK_SECRET=
```

## Requisitos externos

- Meta: System User token con `whatsapp_business_management`
- Chatwoot: admin profile API token (Settings → Profile → Access Token)
- Dominio público TLS ya existe (`blast.funes.luladev.com`)
