# Lula — Conexión Meta simplificada + Inbox completo (diseño)

**Fecha:** 2026-06-11 · **Estado:** aprobado por Luis ("en uno, despliega agentes en paralelo")

## Objetivo

(A) Reducir la fricción de conectar WhatsApp: Lula genera el webhook URL y el verify
token, y guía el copy-paste. (B) Llevar el inbox a paridad con WhatsApp en todo lo que
la **API oficial de WhatsApp Cloud permite**.

## Límites duros de la Cloud API (innegociables, van escritos para no re-litigar)

- ❌ **Última conexión (last seen) del cliente**: la Cloud API NO la expone. Imposible.
- ❌ **Ver "escribiendo…" del cliente**: la Cloud API NO envía typing del usuario. Imposible.
- Cualquier vía "no oficial" para esos dos viola los TOS de WhatsApp y arriesga el número → fuera de alcance, decisión consciente.
- ✅ Sí posibles (y en alcance): respuestas rápidas, marcar leído (ticks azules al cliente),
  enviar "escribiendo…" DESDE el negocio, enviar media/audio/docs, citar/responder, reacciones.

## Parte A — Conexión Meta simplificada

- **Verify token auto-generado** por org: si `organizationSettings.metaVerifyToken` está
  vacío al abrir `/configuracion/meta`, Lula genera uno aleatorio (`lula_<16 hex>`) y lo
  persiste. El cliente nunca lo inventa.
- **Bloque "Conecta tu WhatsApp"**: muestra **Webhook URL** (`${PUBLIC_BASE_URL}/api/webhook/meta`)
  y **Verify token**, cada uno con botón copiar, + guía de 3 pasos (pegar ambos en Meta →
  Configuration → Webhooks; suscribir el campo `messages`).
- El cliente solo pega lo que solo Meta da: Access Token, Phone Number ID, WABA ID, App
  Secret (irreducible sin Embedded Signup, que queda como meta futura, fuera de alcance).
- **Botón "Probar conexión"**: usa la Graph API con el token (reusa
  `/api/meta/test-connection`) y muestra ✓/✗ con el nombre del número verificado.

## Parte B — Inbox completo

1. **Respuestas rápidas** (canned): tabla `quick_replies` por-org (id, orgId, shortcut,
   body, createdAt). Gestión CRUD en `/configuracion/respuestas`. En el composer: escribir
   `/` abre un selector que filtra por shortcut/contenido e inserta el texto.
2. **Marcar leído → ticks azules + typing del negocio**: al abrir un hilo,
   `markReadAction` además llama a Meta `POST /{phoneId}/messages` con
   `{status:"read", message_id:<último wamid entrante>, typing_indicator:{type:"text"}}`
   (un solo call hace ambas cosas; el typing dura ~25s en el lado del cliente). Best-effort:
   si Meta falla, el unread local igual se resetea.
3. **Enviar media**: `uploadMedia` (subir bytes a `/{phoneId}/media` → media_id) +
   `sendMedia` (`type:image|audio|video|document`, link por media_id, caption opcional).
   Composer con botón adjuntar (acepta imagen/audio/video/pdf); el mensaje out se registra
   con su tipo y se renderiza en el hilo (reusa el proxy de media saliente si aplica, o
   muestra preview local).
4. **Citar/responder**: cada burbuja tiene acción "Responder" → el composer muestra el
   mensaje citado y al enviar incluye `context:{message_id:<wamid>}`. Las burbujas
   entrantes con `context` muestran el fragmento citado.
5. **Reacciones**: acción "Reaccionar" por burbuja → `sendReaction`
   (`type:"reaction", reaction:{message_id, emoji}`); se registra y muestra el emoji.
6. Ticks de salientes (✓/✓✓/azul) ya llegan por webhook (Fase 2) — sin cambios.

## Arquitectura (unidades aisladas → paralelizables)

- `src/lib/meta/client.ts`: + `markRead(settings, {wamid, typing?})`, `uploadMedia(settings, {bytes, mime, filename?})`, `sendMedia(settings, {to, kind, mediaId, caption?, replyTo?})`, `sendReaction(settings, {to, wamid, emoji})`. Mismo patrón/clasificación de errores existente.
- `src/lib/db/schema/domain.ts`: + tabla `quick_replies`. `src/lib/inbox/quick-replies.ts`: CRUD store.
- `src/lib/org/settings.ts`: helper `ensureVerifyToken(db, orgId)` (genera+persiste si falta).
- `src/app/(app)/configuracion/meta/page.tsx`: rediseño copy-paste + test conexión.
- `src/app/(app)/configuracion/respuestas/`: CRUD UI de respuestas rápidas.
- `src/app/(app)/inbox/actions.ts`: markReadAction→Meta, sendMediaAction, sendReactionAction; sendMessageAction acepta replyTo.
- `src/app/(app)/inbox/[id]/_components/{composer,thread}.tsx`: `/` canned, adjuntar, citar, reaccionar, render de media/citas/reacciones.

## Pruebas

- client.ts: cada método arma el body correcto y mapea wamid/errores (fetch mock).
- quick-replies: CRUD + aislamiento por org.
- ensureVerifyToken: genera una vez, idempotente.
- markReadAction: llama a Meta con el último wamid entrante + resetea unread aunque Meta falle.
- Gate de suscripción en todas las acciones de envío; aislamiento por org.

## Fuera de alcance

Embedded Signup, last seen del cliente, typing del cliente, auto-suscripción de webhooks
vía API (el cliente suscribe en Meta con el copy-paste), notas internas, asignación de agentes.
