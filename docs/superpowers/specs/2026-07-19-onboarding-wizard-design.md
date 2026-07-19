# Onboarding self-service — Wizard "Conectar WhatsApp" (diseño)

**Fecha:** 2026-07-19 · **Estado:** aprobado para implementación (goal autónomo de Luis)

## Problema

Hoy un cliente nuevo de Lula se registra, paga… y aterriza en un panel vacío. Conectar su WhatsApp exige que Luis configure a mano las credenciales de Meta en `/configuracion/meta`. Eso limita la venta a un cliente a la vez y hace imposible el self-service. (Contexto: el sistema de planes/billing ya está completo — esencial/pro/premium con EfiPay — así que el cuello de botella de activación es este.)

## Objetivo

Un usuario nuevo pasa de signup → WhatsApp conectado y verificado → mensaje de prueba recibido → listo para su primera campaña, **sin intervención de Lula**, guiado por un wizard.

## No-objetivos (esta fase)

- **Embedded Signup de Meta** (OAuth que crea el WABA desde nuestra UI): requiere que Lula sea Tech Provider verificado por Meta (Business verification + App Review de `whatsapp_business_management`). Queda como fase 2; el wizard se diseña para poder insertarlo como "camino rápido" en el Paso 1 sin rehacer nada. Prerequisitos documentados al final.
- Multi-número por org, cambio de número, migración de WABA.

## Arquitectura

Todo se apoya en piezas existentes: `saveMetaCreds`/`saveMetaCredsAction`, `getPhoneHealth` (Graph API), el GET verify del webhook que ya resuelve por `metaVerifyToken` por org, y `sendTemplate`.

### 1. Estado de activación (derivado + 3 timestamps)

Columnas nuevas en `organization_settings` (migración 0035, ADD COLUMN nullable):
- `meta_verified_at` — se estampa cuando "Probar conexión" pasa (getPhoneHealth OK).
- `webhook_verified_at` — se estampa **pasivamente** en el GET verify del webhook cuando Meta llama con el verify token del org (cero fricción: el check se pone verde solo).
- `test_message_sent_at` — se estampa cuando el envío de prueba devuelve wamid.

`src/lib/onboarding/status.ts` → `getOnboardingStatus(db, orgId)`:
```ts
type OnboardingStatus = {
  steps: {
    creds: boolean;          // phoneId+wabaId+appId+token+secret presentes
    credsVerified: boolean;  // meta_verified_at != null
    webhookVerified: boolean;// webhook_verified_at != null
    testMessage: boolean;    // test_message_sent_at != null
    firstCampaign: boolean;  // existe campaña con status != 'draft'
  };
  complete: boolean;         // los 5 en true
  nextStep: 1 | 2 | 3 | 4 | null; // primer paso incompleto del wizard
};
```
`firstCampaign` se deriva con query (no se almacena). Guardar creds nuevas resetea `meta_verified_at` (si cambias el token, hay que re-probar).

### 2. Wizard `/conectar` (grupo (app), requiere sesión, NO gateado por plan)

Stepper de 4 pasos, client component con server actions en `src/app/(app)/conectar/actions.ts`:

- **Paso 1 — Credenciales de Meta.** Form (reusa `saveMetaCredsAction`) con guía es-CO por campo: dónde sacar Phone ID, WABA ID, App ID, token permanente y App Secret en developers.facebook.com (texto guía, sin capturas). Botón **"Probar conexión"** → `verifyMetaConnectionAction`: llama `getPhoneHealth`, muestra número + nombre verificado + calidad devueltos por Graph, estampa `meta_verified_at`. Error → mensaje es-CO accionable.
- **Paso 2 — Webhook.** Muestra la URL `https://luladev.com/api/webhook/meta` y el verify token del org (si es null, el server lo genera al cargar la página: `randomBytes(16).toString("hex")` — patrón ya usado en settings). Botones copiar. Instrucciones: App Dashboard → WhatsApp → Configuración → Webhook, suscribir el campo `messages`. El cliente hace polling (cada 5s, `getOnboardingStatusAction`) y el check se pone verde solo cuando Meta llama el GET verify.
- **Paso 3 — Mensaje de prueba.** Input de teléfono (default vacío, formato E.164 con ayuda) → `sendTestMessageAction`: envía el template **`hello_world` (en_US)** — viene preaprobado en todo WABA nuevo, no depende de la ventana de 24h. Si devuelve wamid → estampa y muestra "Revisa tu WhatsApp 📱". Si el org ya tiene plantillas propias aprobadas es indiferente: hello_world siempre existe.
- **Paso 4 — Listo.** Resumen con checks + CTA "Crear tu primera campaña" (`/campanas/nueva`) y "Importar contactos" (`/contactos`).

El stepper permite navegar hacia atrás; el paso activo por defecto = `nextStep`.

### 3. Activación visible en el panel

- `src/app/(app)/panel/_components/onboarding-banner.tsx` (server component): si `!complete`, card con progreso (5 checks) y botón "Continuar configuración" → `/conectar`. Si `complete`, no renderiza nada.
- `/panel/page.tsx`: si `!steps.creds` (org totalmente virgen) → `redirect("/conectar")`. Con creds parciales solo banner, sin redirect (no molestar a orgs existentes).

### 4. Stamp pasivo en el webhook

En el GET de `/api/webhook/meta`, tras encontrar settings por token: `UPDATE organization_settings SET webhook_verified_at = now WHERE org_id = … AND webhook_verified_at IS NULL` (solo primera vez), antes de devolver el challenge.

## Seguridad

- Token y App Secret son write-only: el form nunca los recibe de vuelta (se muestra "•••• guardado" si existen — comportamiento actual de configuración se conserva).
- Todas las actions con `requireOrg()`. `sendTestMessageAction` valida E.164 y máximo 3 envíos por hora por org (guard simple en memoria no sirve en multi-proceso → contar `test_message_sent_at` no aplica; se usa un límite blando: si ya se estampó hace <2 min, rechazar — suficiente para abuso accidental).
- El verify token generado es aleatorio de 32 hex; no se loguea.

## Testing

- Unit: derivación de `getOnboardingStatus` (matrices de campos presentes/ausentes), stamp del GET verify (primera vez sí, segunda no la pisa), `sendTestMessageAction` con fetch mock (wamid → estampa; error Graph → no estampa), reset de `meta_verified_at` al guardar creds.
- Build + lint + tsc. Smoke visual con dev server + browser sobre la org demo local.
- Verificación prod post-deploy: `/conectar` responde tras login; GET verify sigue funcionando para orgs existentes (no debe romper el webhook vivo).

## Fase 2 (no se construye ahora): Embedded Signup — prerequisitos para Luis

1. Business verification del Business Manager de Lula (Meta Business Suite → Seguridad).
2. App de Meta en modo Live con **Facebook Login for Business** y producto WhatsApp.
3. Solicitar Advanced Access a `whatsapp_business_management` y `whatsapp_business_messaging` (App Review con screencast).
4. Crear una "Configuration" de Embedded Signup (App Dashboard → Facebook Login for Business → Configurations) → da el `config_id`.
5. (Opcional) Solicitar estatus de Tech Provider / Solution Partner para onboarding multi-cliente.
Con eso, el Paso 1 del wizard gana un botón "Conectar con Facebook" que reemplaza el form manual; el form queda como fallback.
