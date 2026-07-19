# Wizard Onboarding "Conectar WhatsApp" — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding self-service: wizard `/conectar` de 4 pasos (credenciales → webhook → mensaje de prueba → listo) + banner de activación en el panel, sin intervención manual de Luis.

**Architecture:** Ver spec `docs/superpowers/specs/2026-07-19-onboarding-wizard-design.md` (leerla primero SIEMPRE). Estado derivado de datos + 3 timestamps nuevos en organization_settings; stamp pasivo del webhook GET; reusa saveMetaCredsAction, getPhoneHealth, sendTemplate.

**Tech Stack:** Next.js App Router, Drizzle/SQLite, shadcn/ui, server actions.

## Global Constraints

- Rama de trabajo: `onboarding-wizard-jul19` (ya creada). Tras cada commit: `git push`.
- Tests: `bunx vitest run <archivo>`; suite completa + `bunx tsc --noEmit` + `bun run lint` antes de cada commit final de task.
- Migraciones: `bun run db:generate` + `bun run db:migrate` (local data.db). Esta rama parte con 0034 aplicada → la nueva es 0035, solo ADD COLUMNs, sin edición manual.
- Copy es-CO, sin jerga técnica innecesaria, sin emojis en UI (iconos lucide) — EXCEPCIÓN: el "Revisa tu WhatsApp" del paso 3 va sin emoji también.
- Token/App Secret NUNCA vuelven al cliente (write-only).
- `/conectar` requiere sesión pero NO gate de plan.
- El GET verify del webhook debe seguir devolviendo el challenge idéntico para orgs existentes (no romper webhooks vivos).
- Rutas con paréntesis entre comillas en shell: `'src/app/(app)/conectar/...'`.
- UI: seguir patrones existentes del panel (revisar `/configuracion/meta` page y sus componentes antes de escribir el wizard). GOTCHA repo: el Button de este repo NO soporta asChild — para links estilizados usar `buttonVariants` + cn.

---

### Task 1: Migración + estado de onboarding

**Files:**
- Modify: `src/lib/db/schema/domain.ts:12-29` (organizationSettings: 3 columnas), `src/lib/org/settings.ts` (exponer campos + reset en saveMetaCreds)
- Create: `src/lib/onboarding/status.ts`, migración 0035, `tests/unit/onboarding-status.test.ts`

**Interfaces:**
- Produces: `getOnboardingStatus(db, orgId): Promise<OnboardingStatus>` con el shape exacto del spec (§1); columnas Drizzle `metaVerifiedAt`/`webhookVerifiedAt`/`testMessageSentAt` (`integer(..., { mode: "timestamp" })` nullable); `saveMetaCreds` pone `metaVerifiedAt: null` cuando cambian token/secret/phoneId.

- [ ] **Step 1: Test que falla** — `tests/unit/onboarding-status.test.ts` con patrón de DB de `tests/unit/webhook-idempotency.test.ts`: (a) org virgen → todos los steps false, nextStep 1; (b) creds presentes sin verificar → creds true, credsVerified false, nextStep 1; (c) los 3 timestamps + campaña con status "done" → complete true, nextStep null; (d) creds+verified sin webhook → nextStep 2.
- [ ] **Step 2: RED** — `bunx vitest run tests/unit/onboarding-status.test.ts` falla (módulo no existe).
- [ ] **Step 3: Schema + migración** — añadir columnas, `bun run db:generate`, `bun run db:migrate`.
- [ ] **Step 4: Implementar** — `status.ts`:

```ts
import { and, eq, ne } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaigns, organizationSettings } from "@/lib/db/schema";

export type OnboardingStatus = {
  steps: { creds: boolean; credsVerified: boolean; webhookVerified: boolean; testMessage: boolean; firstCampaign: boolean };
  complete: boolean;
  nextStep: 1 | 2 | 3 | 4 | null;
};

export async function getOnboardingStatus(db: DB, orgId: string): Promise<OnboardingStatus> {
  const [row] = await db.select().from(organizationSettings).where(eq(organizationSettings.orgId, orgId));
  const creds = !!(row?.metaPhoneId && row?.metaWabaId && row?.metaAppId && row?.metaAccessTokenEnc && row?.metaAppSecretEnc);
  const credsVerified = creds && !!row?.metaVerifiedAt;
  const webhookVerified = !!row?.webhookVerifiedAt;
  const testMessage = !!row?.testMessageSentAt;
  const [camp] = await db.select({ id: campaigns.id }).from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), ne(campaigns.status, "draft"))).limit(1);
  const firstCampaign = !!camp;
  const steps = { creds, credsVerified, webhookVerified, testMessage, firstCampaign };
  const complete = Object.values(steps).every(Boolean);
  const nextStep = !credsVerified ? 1 : !webhookVerified ? 2 : !testMessage ? 3 : !firstCampaign ? 4 : null;
  return { steps, complete, nextStep: complete ? null : nextStep };
}
```
En `saveMetaCreds` (settings.ts): añadir `metaVerifiedAt: null` al objeto `update` (cualquier guardado de creds exige re-probar) y exponer los 3 campos nuevos en `DecryptedSettings`/`getOrgSettings`.
- [ ] **Step 5: GREEN + commit** — test verde, `git add -A && git commit -m "feat(onboarding): estado de activacion derivado + timestamps" && git push`.

---

### Task 2: Stamp pasivo en el GET verify del webhook

**Files:**
- Modify: `src/app/api/webhook/meta/route.ts` (GET, líneas ~20-26)
- Test: `tests/unit/webhook-verify-stamp.test.ts` (crear)

**Interfaces:**
- Consumes: columna `webhookVerifiedAt` (Task 1).
- Produces: al verificar con token válido, estampa `webhook_verified_at` SOLO si era null; challenge devuelto idéntico (200, texto plano).

- [ ] **Step 1: Test que falla** — con DB de test: settings con verify token "tok1" y webhookVerifiedAt null → llamar el GET (Request construido con URL `?hub.mode=subscribe&hub.verify_token=tok1&hub.challenge=abc`) → responde 200 "abc" y webhookVerifiedAt queda estampado; segunda llamada NO cambia el timestamp (guardar valor y comparar); token inválido → 403 y sin stamp.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** — tras encontrar settings:

```ts
if (!settings.webhookVerifiedAt) {
  await db.update(organizationSettings)
    .set({ webhookVerifiedAt: new Date() })
    .where(and(eq(organizationSettings.orgId, settings.orgId), isNull(organizationSettings.webhookVerifiedAt)));
}
```
- [ ] **Step 4: GREEN + suite + commit** — `git commit -m "feat(onboarding): stamp pasivo de webhook verificado" && git push`.

---

### Task 3: Server actions del wizard

**Files:**
- Create: `src/app/(app)/conectar/actions.ts`, `tests/unit/conectar-actions.test.ts`
- Modify: `src/lib/org/settings.ts` (helper `ensureVerifyToken` si no existe ya uno equivalente)

**Interfaces:**
- Consumes: `getPhoneHealth(creds)` de `@/lib/meta/graph` + `credsFromSettings`; `sendTemplate` de `@/lib/meta/client`; `getOnboardingStatus` (Task 1); `requireOrg()`.
- Produces (shapes exactos):

```ts
export async function verifyMetaConnectionAction(): Promise<
  { ok: true; phone: string; name: string; quality: string } | { ok: false; message: string }>
export async function sendTestMessageAction(formData: FormData): Promise<{ ok: boolean; message: string }>
export async function getOnboardingStatusAction(): Promise<OnboardingStatus>
export async function ensureVerifyTokenAction(): Promise<{ url: string; token: string }>
```

- [ ] **Step 1: Tests que fallan** — con fetch mockeado (patrón `tests/unit/calling-actions.test.ts`) y DB de test; requireOrg se mockea con `vi.mock("@/lib/auth/session", ...)`: (a) verifyMetaConnection con Graph OK → estampa metaVerifiedAt y devuelve phone/name; con Graph 401 → ok false, sin stamp; (b) sendTestMessage con wamid → estampa testMessageSentAt; re-llamada a <2 min → rechazada con mensaje "Espera un momento antes de reenviar."; teléfono inválido → rechazado; (c) ensureVerifyToken genera token de 32 hex si null y lo conserva si existe.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** — puntos no obvios:
  - `verifyMetaConnectionAction`: `const s = await getOrgSettings(db, orgId); const creds = credsFromSettings(s); if (!creds) return { ok: false, message: "Primero guarda las credenciales." };` → `getPhoneHealth(creds)` → estampar `metaVerifiedAt: new Date()` → devolver `display_phone_number`, `verified_name`, `quality_rating`. Errores Graph → mensaje es-CO ("Meta rechazó el token. Verifica que sea el token permanente del System User.").
  - `sendTestMessageAction`: validar E.164 con la util del repo si existe (grep "E164\|normalizePhone" src/lib) o regex `/^\+[1-9]\d{7,14}$/`; guard: si `testMessageSentAt` hace <2 min → rechazar; `sendTemplate(s, { to, name: "hello_world", language: "en_US", components: [] })` (ajustar a la firma REAL de sendTemplate — leerla antes); wamid → estampa.
  - `ensureVerifyTokenAction`: si `metaVerifyToken` null → `randomBytes(16).toString("hex")` y persistir (vía saveMetaCreds parcial o update directo); devolver `{ url: "https://luladev.com/api/webhook/meta", token }`. La URL base de `process.env.BETTER_AUTH_URL ?? "https://luladev.com"` para que funcione en local.
- [ ] **Step 4: GREEN + suite + commit** — `git commit -m "feat(onboarding): actions del wizard conectar" && git push`.

---

### Task 4: UI del wizard /conectar

**Files:**
- Create: `src/app/(app)/conectar/page.tsx` (server: carga status + token) y `src/app/(app)/conectar/_components/wizard.tsx` (client stepper) + sub-componentes por paso si el archivo pasa de ~300 líneas
- Reference: leer `src/app/(app)/configuracion/meta/page.tsx` y sus components ANTES (reusar el form de creds si es reutilizable; si está acoplado, extraer o duplicar el form mínimo con saveMetaCredsAction)

**Interfaces:**
- Consumes: las 4 actions (Task 3), `saveMetaCredsAction` de configuración, `getOnboardingStatus` server-side para el paso inicial.
- Produces: ruta `/conectar` con stepper 4 pasos según spec §2 (copy es-CO, iconos lucide Check/Copy/Loader2, polling 5s SOLO mientras el paso 2 está activo y la pestaña visible).

- [ ] **Step 1: Página server** — carga `getOnboardingStatus` + `ensureVerifyTokenAction` y pasa a `<Wizard initialStatus={...} webhook={{url, token}} />`.
- [ ] **Step 2: Stepper client** — estado `step` inicial = `nextStep ?? 4`; navegación atrás libre, adelante solo si el paso anterior está completo (según status refrescado). Paso 1: form creds (5 campos, placeholders con ejemplo de formato, ayuda por campo colapsable) + "Probar conexión" con resultado inline (número + nombre + calidad en verde). Paso 2: URL + token con botón copiar (navigator.clipboard) + lista numerada de instrucciones + badge "Esperando a Meta…" con polling `getOnboardingStatusAction` cada 5s (guard `document.hidden`) hasta `webhookVerified`. Paso 3: input teléfono + botón enviar + estados. Paso 4: checks resumen + 2 CTAs (`buttonVariants` + Link, el Button del repo NO soporta asChild).
- [ ] **Step 3: Verificación** — `bunx tsc --noEmit && bun run lint && bun run build` OK. Smoke: `bun run dev` y abrir `/conectar` logueado con la org demo (si no hay browser tooling disponible, dejar el smoke anotado como pendiente para el controller y verificar al menos que la ruta compila y renderiza el HTML del paso 1 vía curl con cookie... si no hay cookie a mano, solo build).
- [ ] **Step 4: Commit** — `git commit -m "feat(onboarding): wizard /conectar de 4 pasos" && git push`.

---

### Task 5: Banner de activación en el panel + redirect

**Files:**
- Create: `src/app/(app)/panel/_components/onboarding-banner.tsx`
- Modify: `src/app/(app)/panel/page.tsx`

**Interfaces:**
- Consumes: `getOnboardingStatus` (Task 1).
- Produces: en `/panel`, si `!steps.creds` → `redirect("/conectar")`; si creds pero `!complete` → banner card (5 checks con labels es-CO: "Credenciales", "Conexión probada", "Webhook activo", "Mensaje de prueba", "Primera campaña") + botón "Continuar configuración"; si `complete` → nada.

- [ ] **Step 1: Implementar** — banner server component (sin "use client"); en page.tsx del panel, el redirect va ANTES de cualquier otro fetch pesado.
- [ ] **Step 2: Test** — `tests/unit/onboarding-status.test.ts` ya cubre la derivación; para el banner basta el build (server component sin lógica nueva). Verificar manualmente en dev que una org completa NO ve el banner (org demo tiene creds → ver qué pasos le faltan y anotar en el report).
- [ ] **Step 3: Verificación + commit** — suite completa + tsc + lint + build → `git commit -m "feat(onboarding): banner de activacion y redirect en panel" && git push`.

---

### Task 6: Ship — merge, deploy y verificación prod

- [ ] **Step 1: Gate completo** — `bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build` todo verde en la rama.
- [ ] **Step 2: Merge + push** — `git checkout main && git merge --ff-only onboarding-wizard-jul19 && git push`.
- [ ] **Step 3: Deploy** — `bash deploy/deploy.sh` (corre db:migrate en el server — la 0035 es solo ADD COLUMNs, segura).
- [ ] **Step 4: Verificación prod** —
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://luladev.com/conectar        # 307 → login (requiere sesión)
curl -s -o /dev/null -w "%{http_code}\n" "https://luladev.com/api/webhook/meta?hub.mode=subscribe&hub.challenge=1&hub.verify_token=x"  # 403 (verify sigue vivo)
ssh root@158.220.123.213 "sqlite3 /var/lib/wa-blast/data.db 'PRAGMA table_info(organization_settings);' | grep -c verified"  # 2 columnas nuevas
```
Y confirmar que el webhook POST de orgs existentes sigue procesando (systemctl status + logs sin errores nuevos).
- [ ] **Step 5: Reporte** — resumen + pendientes (smoke visual del wizard con login real; checklist Meta de fase 2 del spec para Luis).
