# Correcciones de Auditoría Lula (luladev.com) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar todas las correcciones de la auditoría 2026-07-18 (seguridad, robustez backend, performance) y dejar prod verificado.

**Architecture:** Fixes quirúrgicos sobre el monolito Next.js existente (App Router + Drizzle/SQLite + Better Auth). Idempotencia por índices únicos + `onConflictDoNothing`. Landing pasa de dinámica a ISR. Sin dependencias nuevas salvo `@tanstack/react-virtual`.

**Tech Stack:** Next.js (App Router), Bun (dev), Node (prod, better-sqlite3), Drizzle ORM, Vitest, better-auth, motion/react.

## Global Constraints

- Runtime de tests: `bunx vitest run <archivo>` (suite completa: `bunx vitest run`, tarda ~1 min).
- Lint: `bun run lint` (eslint). Typecheck: `bunx tsc --noEmit`.
- Prod corre **Node** (`next start`), no Bun (better-sqlite3 no carga en Bun). No usar APIs solo-Bun.
- `/media/*` y `/shots/*` deben seguir **públicos** (Meta descarga la media por URL; las capturas las usa la landing).
- La verificación de firma HMAC de webhooks (`verifyMetaSignature`) NO se toca.
- Copy visible al usuario en es-CO, sin jerga técnica.
- Tras cada commit: `git push` (regla de Luis, sin preguntar).
- NO desplegar a prod hasta la Task 15 (deploy único al final con verificación).
- Los archivos de rutas con paréntesis se escapan en shell: `src/app/\(app\)/...`.

---

### Task 1: Limpieza del repo (duplicados iCloud + dir fantasma)

**Files:**
- Delete: los 11 archivos `* 2.*` bajo `src/` y `tests/` + dir vacío `src/app/\(app\)` (backslashes literales)
- Check: `src/app/(app)/inbox/@detail/[id]/_components/contact-avatar.tsx` (untracked)

**Interfaces:** N/A (solo limpieza; ningún archivo borrado está importado — son duplicados git-ignorados por la regla `* [0-9].*` de `.gitignore`).

- [ ] **Step 1: Borrar duplicados y dir fantasma**

```bash
cd ~/Documents/wa-blast
find src tests scripts -name "* 2.*" -print -delete
rmdir 'src/app/\(app\)'
```

- [ ] **Step 2: Decidir contact-avatar.tsx**

```bash
grep -rn "contact-avatar" src --include="*.tsx" --include="*.ts"
```
Si algún archivo lo importa → `git add` e incluir en el commit. Si nadie lo importa → dejarlo untracked y reportarlo en el resumen de la task (es WIP de Luis, no borrarlo).

- [ ] **Step 3: Verificar que lint queda limpio**

Run: `bun run lint`
Expected: 0 errors (el error de `orders-shell 2.tsx` desaparece). Puede quedar el warning de `<img>` en `_payments.tsx:229` — se ignora (es un preview de comprobante subido por el usuario).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: eliminar duplicados de iCloud y dir fantasma con paréntesis escapados" && git push
```

---

### Task 2: Actualizar tests desactualizados de calling

**Files:**
- Modify: `tests/unit/calling-actions.test.ts:36-38`

**Interfaces:** N/A. El código de producción ya es correcto (commit `04e3cbd` añadió `messaging_product: "whatsapp"` al body de `/calls`); solo el expected del test quedó viejo.

- [ ] **Step 1: Ver el fallo actual**

Run: `bunx vitest run tests/unit/calling-actions.test.ts`
Expected: 2 FAIL — el body recibido trae `messaging_product: "whatsapp"` y el expected no.

- [ ] **Step 2: Actualizar los expected**

En las dos aserciones que fallan (rejectCall y terminateCall, líneas ~36-38), añadir `messaging_product: "whatsapp"` al objeto esperado:

```ts
expect(JSON.parse(...)).toEqual({ messaging_product: "whatsapp", action: "reject", call_id: "CID" });
// y lo análogo para terminate
```
(Respetar la forma exacta que ya reporta el diff del test: `{ action, call_id, messaging_product }`.)

- [ ] **Step 3: Verificar verde y commit**

Run: `bunx vitest run tests/unit/calling-actions.test.ts` → Expected: PASS (todos)

```bash
git add tests/unit/calling-actions.test.ts && git commit -m "test: actualizar expected de calling con messaging_product" && git push
```

---

### Task 3: Proxy — matching exacto de rutas públicas

**Files:**
- Modify: `src/proxy.ts`
- Test: `tests/unit/proxy-public-paths.test.ts` (crear)

**Interfaces:**
- Produces: `isPublicPath(pathname: string): boolean` exportada desde `src/proxy.ts`.

- [ ] **Step 1: Escribir test que falla**

```ts
// tests/unit/proxy-public-paths.test.ts
import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/proxy";

describe("isPublicPath", () => {
  it("permite la raíz y las rutas públicas exactas y sus subrutas", () => {
    for (const p of ["/", "/login", "/signup", "/api/auth/session", "/api/webhook/meta", "/api/cron/run-scheduled", "/media/abc-123", "/shots/panel.png"]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });
  it("NO permite rutas que solo comparten prefijo", () => {
    for (const p of ["/api/webhook-admin", "/api/cronx", "/mediaX", "/loginfake", "/panel", "/inbox"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bunx vitest run tests/unit/proxy-public-paths.test.ts`
Expected: FAIL — `isPublicPath` no existe.

- [ ] **Step 3: Implementar en proxy.ts**

```ts
const PUBLIC_PATHS = ["/login", "/signup", "/verify", "/reset-password", "/api/auth", "/api/webhook", "/api/cron", "/media", "/shots"];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
```
Y en `proxy()` reemplazar el bloque de `pathname === "/"` + `PUBLIC_PATHS.some(...)` por un único `if (isPublicPath(pathname)) return NextResponse.next();`.

- [ ] **Step 4: Verificar y commit**

Run: `bunx vitest run tests/unit/proxy-public-paths.test.ts && bunx tsc --noEmit` → PASS

```bash
git add src/proxy.ts tests/unit/proxy-public-paths.test.ts && git commit -m "fix(security): matching exacto de rutas publicas en el proxy" && git push
```

---

### Task 4: SSRF — validar forwardUrl al guardarla

**Files:**
- Create: `src/lib/security/validate-forward-url.ts`
- Modify: `src/app/(app)/configuracion/actions.ts` (función `saveForwardUrlAction`, línea ~36)
- Test: `tests/unit/validate-forward-url.test.ts` (crear)

**Interfaces:**
- Produces: `validateForwardUrl(raw: string): Promise<{ ok: true } | { ok: false; error: string }>`.
- Riesgo residual aceptado: DNS rebinding después de guardada (se valida al guardar, no en cada envío). Documentarlo en un comentario del archivo nuevo.

- [ ] **Step 1: Test que falla**

```ts
// tests/unit/validate-forward-url.test.ts
import { describe, expect, it } from "vitest";
import { validateForwardUrl } from "@/lib/security/validate-forward-url";

describe("validateForwardUrl", () => {
  it("rechaza esquemas no http(s), localhost, IPs privadas y metadata", async () => {
    for (const bad of [
      "file:///etc/passwd", "ftp://x.com/a", "no-es-url",
      "http://localhost:3000/hook", "http://127.0.0.1/hook", "https://[::1]/hook",
      "http://10.0.0.5/hook", "http://172.16.0.1/hook", "http://192.168.1.1/hook",
      "http://169.254.169.254/latest/meta-data", "http://foo.local/hook",
    ]) {
      const r = await validateForwardUrl(bad);
      expect(r.ok, bad).toBe(false);
    }
  });
  it("acepta https públicas", async () => {
    expect((await validateForwardUrl("https://hooks.zapier.com/x")).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `bunx vitest run tests/unit/validate-forward-url.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// src/lib/security/validate-forward-url.ts
// Valida la URL de reenvío de webhooks para evitar SSRF hacia la red interna.
// Riesgo residual: DNS rebinding tras guardar (se valida al guardar, no por envío).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    return low === "::1" || low === "::" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80") || low.startsWith("::ffff:127.") || low.startsWith("::ffff:10.") || low.startsWith("::ffff:192.168.");
  }
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

export async function validateForwardUrl(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "La URL no es válida." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Solo se permiten URLs http(s)." };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Ese host no está permitido." };
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, error: "No se permiten IPs privadas o reservadas." };
    return { ok: true };
  }
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.some((r) => isPrivateIp(r.address))) return { ok: false, error: "El dominio resuelve a una IP privada." };
  } catch {
    return { ok: false, error: "No pudimos resolver ese dominio." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Conectar en la action**

En `src/app/(app)/configuracion/actions.ts` (`saveForwardUrlAction`), después de obtener `url` y **solo si `url` no queda vacía**:

```ts
const check = await validateForwardUrl(url);
if (!check.ok) return { ok: false, message: check.error };
```
(import arriba: `import { validateForwardUrl } from "@/lib/security/validate-forward-url";`)

- [ ] **Step 5: Verificar y commit**

Run: `bunx vitest run tests/unit/validate-forward-url.test.ts && bunx tsc --noEmit` → PASS

```bash
git add src/lib/security/validate-forward-url.ts tests/unit/validate-forward-url.test.ts 'src/app/(app)/configuracion/actions.ts'
git commit -m "fix(security): validar forwardUrl contra SSRF al guardarla" && git push
```

---

### Task 5: Quitar logging temporal con datos sensibles

**Files:**
- Delete: `src/lib/meta/call-webhook-log.ts`
- Modify: `src/app/api/webhook/meta/route.ts` (quitar `logCallWebhook(rawBody)` ~línea 54, `logInboundMessageRaw(m)` ~línea 65, y su import)

**Interfaces:** N/A. El debug de calling ya cumplió su función (fix `e970ed4` desplegado).

- [ ] **Step 1: Quitar llamadas e import; borrar el archivo**

```bash
rm src/lib/meta/call-webhook-log.ts
```
En `route.ts` eliminar el import de `call-webhook-log` y las dos líneas marcadas `// TEMPORAL`.

- [ ] **Step 2: Verificar que nada más lo usa**

Run: `grep -rn "call-webhook-log\|logCallWebhook\|logInboundMessageRaw" src tests` → sin resultados.
Run: `bunx tsc --noEmit && bunx vitest run tests/unit --silent` (si hay test del webhook que lo referencie, actualizarlo quitando la referencia).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "fix(security): retirar logging temporal de webhooks con datos personales" && git push
```

---

### Task 6: next.config — headers de seguridad + imágenes

**Files:**
- Modify: `next.config.ts` (hoy está vacío)

**Interfaces:** Los headers aplican a todas las rutas; `/media/[id]` ya emite su propio `cache-control` (no se pisa). NO añadir CSP en esta pasada (rompería inline scripts de Next sin nonce).

- [ ] **Step 1: Escribir la config**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
```
Nota: NO deshabilitar `microphone` en Permissions-Policy — el módulo de llamadas WebRTC (Fase 2) lo necesitará.

- [ ] **Step 2: Verificar build local**

Run: `bun run build`
Expected: build OK. Luego `bun run start` en :3000 y `curl -sI http://localhost:3000/login | grep -i "strict-transport\|x-frame\|x-powered"` → aparecen los headers nuevos y NO aparece `x-powered-by`.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts && git commit -m "feat(security,perf): headers de seguridad y formatos modernos de imagen" && git push
```

---

### Task 7: Timeouts en todas las llamadas a Meta

**Files:**
- Modify: `src/lib/meta/client.ts` (7 fetch), `src/lib/meta/calling.ts` (5 fetch), `src/lib/meta/graph.ts` (los fetch que tenga), `src/lib/campaigns/worker.ts:64` (fetch del header media)
- Test: `tests/unit/meta-fetch-timeout.test.ts` (crear)

**Interfaces:**
- Produces: constante `GRAPH_TIMEOUT_MS = 15_000` exportada desde `src/lib/meta/client.ts`; todo fetch a graph.facebook.com lleva `signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS)`.

- [ ] **Step 1: Test que falla**

```ts
// tests/unit/meta-fetch-timeout.test.ts
import { describe, expect, it, vi } from "vitest";
import { sendText } from "@/lib/meta/client";

const settings = { metaPhoneId: "P", metaToken: "T" } as never;

describe("timeouts hacia Meta", () => {
  it("sendText pasa un AbortSignal al fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }),
    );
    await sendText(settings, "+573001112233", "hola");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    fetchMock.mockRestore();
  });
});
```
(Ajustar la firma de `sendText` a la real leyendo `client.ts:29` — si exige más campos en settings, completarlos.)

- [ ] **Step 2: Verificar que falla** — `bunx vitest run tests/unit/meta-fetch-timeout.test.ts` → FAIL (`init.signal` undefined).

- [ ] **Step 3: Implementar**

En `client.ts` arriba: `export const GRAPH_TIMEOUT_MS = 15_000;`
Localizar TODOS los call sites: `grep -n "await fetch(" src/lib/meta/client.ts src/lib/meta/calling.ts src/lib/meta/graph.ts`
En cada options object añadir `signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS)` (en `calling.ts` y `graph.ts` importarla de `./client`).
En `worker.ts:64`: `await fetch(handle, { cache: "no-store", signal: AbortSignal.timeout(30_000) })` (30s: descarga media pesada, y ya está dentro de try/catch).

- [ ] **Step 4: Verificar y commit**

Run: `bunx vitest run tests/unit/meta-fetch-timeout.test.ts tests/unit/calling-actions.test.ts && bunx tsc --noEmit` → PASS (los tests de calling siguen verdes porque los mocks ignoran el signal extra).

```bash
git add -A && git commit -m "fix(robustez): timeout en todas las llamadas a graph.facebook.com" && git push
```

---

### Task 8: Idempotencia de webhooks (contadores fieles)

**Files:**
- Modify: `src/lib/db/schema/domain.ts:167-180` (messageEvents: índice único), `src/lib/meta/webhook-handlers.ts` (handleStatusEvent + handleInboundMessage)
- Create: migración drizzle (generada + editada a mano)
- Test: `tests/unit/webhook-idempotency.test.ts` (crear; usar el helper de `src/lib/db/test-db.ts` como hacen los tests existentes — leer un test vecino de `tests/unit/` que use DB para copiar el patrón de setup)

**Interfaces:**
- Produces: `message_events` con `UNIQUE(wamid, event)`; ambos handlers retornan temprano si el evento ya fue procesado. `sent→delivered→read` del mismo wamid son eventos distintos y siguen pasando.

- [ ] **Step 1: Test que falla**

```ts
// tests/unit/webhook-idempotency.test.ts — esqueleto; copiar el setup de DB de un test vecino
import { describe, expect, it } from "vitest";
import { handleStatusEvent, handleInboundMessage } from "@/lib/meta/webhook-handlers";
// ...setup: db de test + org + campaña con un recipient con wamid "wamid.A" y status "sent", sent=1, delivered=0

describe("idempotencia de webhooks", () => {
  it("un status 'delivered' retransmitido solo incrementa una vez", async () => {
    const status = { id: "wamid.A", status: "delivered" as const, timestamp: "1700000000", recipient_id: "573001112233" };
    await handleStatusEvent(db, orgId, status);
    await handleStatusEvent(db, orgId, status); // retransmisión de Meta
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(camp.delivered).toBe(1);
  });
  it("un mensaje entrante retransmitido solo cuenta un reply", async () => {
    const msg = { from: "573001112233", id: "wamid.IN1", timestamp: "1700000100", type: "text", text: { body: "info" } };
    await handleInboundMessage(db, orgId, msg, []);
    await handleInboundMessage(db, orgId, msg, []);
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(camp.replied).toBe(1);
  });
});
```

- [ ] **Step 2: Verificar que falla** — delivered=2 / replied=2.

- [ ] **Step 3: Schema + migración**

En `domain.ts`, messageEvents: importar `uniqueIndex` y añadir al bloque de índices:
```ts
wamidEventUnique: uniqueIndex("events_wamid_event_unique").on(t.wamid, t.event),
```
Run: `bun run db:generate`
**Editar el SQL generado** para deduplicar ANTES de crear el índice (prepend):
```sql
DELETE FROM `message_events` WHERE `id` NOT IN (SELECT MIN(`id`) FROM `message_events` GROUP BY `wamid`, `event`);
```
Run: `bun run db:migrate` (aplica a data.db local).

- [ ] **Step 4: Handlers**

`handleStatusEvent` — reemplazar el insert inicial (líneas 19-24) por gate:
```ts
const inserted = await db
  .insert(messageEvents)
  .values({ wamid: status.id, event: status.status, timestamp: ts, payload: JSON.stringify(status) })
  .onConflictDoNothing({ target: [messageEvents.wamid, messageEvents.event] })
  .returning({ id: messageEvents.id });
if (inserted.length === 0) return; // webhook retransmitido: ya procesado
```

`handleInboundMessage` — mover el insert del evento "replied" (líneas 101-106) ANTES del bloque de opt-out (línea 79), con el mismo patrón `onConflictDoNothing(...).returning(...)`; si `inserted.length === 0` → `return` (el bloque de reacciones, líneas 68-75, queda ANTES del gate: `upsertReaction` ya es idempotente y las reacciones no traen wamid propio procesable).

- [ ] **Step 5: Verificar y commit**

Run: `bunx vitest run tests/unit/webhook-idempotency.test.ts && bunx vitest run` (suite completa — los tests existentes de webhook-handlers no deben romperse; si alguno asume doble insert, corregir el test citando este cambio).

```bash
git add -A && git commit -m "fix(bi): idempotencia de webhooks de Meta — contadores sin duplicados" && git push
```

---

### Task 9: Cron — claim atómico + recuperación de campañas atascadas

**Files:**
- Modify: `src/lib/db/schema/domain.ts` (campaigns: columna `statusChangedAt`), `src/app/api/cron/run-scheduled/route.ts`, `src/lib/campaigns/worker.ts:27,309`
- Create: migración drizzle
- Test: `tests/unit/cron-claim.test.ts` (crear, mismo patrón de DB de test)

**Interfaces:**
- Produces: `campaigns.statusChangedAt` (`integer("status_changed_at", { mode: "timestamp" })`, nullable). El worker lo estampa al pasar a `sending` y `done`; el cron al pasar a `queued` y al recuperar atascadas.

- [ ] **Step 1: Tests que fallan**

```ts
// tests/unit/cron-claim.test.ts — dos casos:
// 1) claim atómico: con una campaña "draft" vencida, simular doble claim:
//    el primer UPDATE con WHERE status='draft' devuelve 1 fila; el segundo, 0.
//    (probar claimDueCampaign(db, id) exportada del route o del worker — ver Step 3)
// 2) recovery: campaña con status='sending' y statusChangedAt hace 3 horas
//    → recoverStuckCampaigns(db) la deja en 'draft' con scheduledAt ≈ now.
```

- [ ] **Step 2: Schema + migración**

Añadir a campaigns: `statusChangedAt: integer("status_changed_at", { mode: "timestamp" }),`
Run: `bun run db:generate && bun run db:migrate`

- [ ] **Step 3: Implementar**

En `route.ts`, exportar dos helpers puros (para test) y usarlos en el GET:

```ts
export async function claimDueCampaign(db: DB, id: string): Promise<boolean> {
  const claimed = await db
    .update(campaigns)
    .set({ status: "queued", statusChangedAt: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.status, "draft")))
    .returning({ id: campaigns.id });
  return claimed.length > 0;
}

const STUCK_MS = 2 * 3600 * 1000;
export async function recoverStuckCampaigns(db: DB): Promise<string[]> {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const stuck = await db
    .update(campaigns)
    .set({ status: "draft", scheduledAt: new Date(), statusChangedAt: new Date() })
    .where(and(
      eq(campaigns.status, "sending"),
      or(isNull(campaigns.statusChangedAt), lte(campaigns.statusChangedAt, cutoff)),
    ))
    .returning({ id: campaigns.id });
  return stuck.map((s) => s.id);
}
```
En el GET: primero `const recovered = await recoverStuckCampaigns(db)` (log si recupera algo), luego el loop actual pero con `if (!(await claimDueCampaign(db, c.id))) continue;` en vez del update incondicional. Incluir `recovered` en el JSON de respuesta.
En `worker.ts`: línea 27 → `.set({ status: "sending", statusChangedAt: new Date() })`; línea 309 → `.set({ status: "done", statusChangedAt: new Date() })`.
Nota re-lanzado seguro: el worker solo envía a recipients con status `pending`, así que retomar una campaña no re-envía a quienes ya recibieron.

- [ ] **Step 4: Verificar y commit**

Run: `bunx vitest run tests/unit/cron-claim.test.ts && bunx tsc --noEmit` → PASS

```bash
git add -A && git commit -m "fix(campanas): claim atomico en cron y recuperacion de campanas atascadas en sending" && git push
```

---

### Task 10: Calls sin duplicados + TokenBucket + catches con log

**Files:**
- Modify: `src/lib/db/schema/domain.ts:543+` (calls: índice único org+wacid), `src/lib/calls/store.ts:30-66`, `src/lib/campaigns/rate-limit.ts`, `src/lib/campaigns/worker.ts` (catches silenciosos líneas ~89, ~116, ~293)
- Create: migración drizzle
- Test: extender `tests/unit/` con `calls-dedup.test.ts`; el rate limiter probablemente ya tiene test — extenderlo

**Interfaces:**
- Produces: `calls` con `UNIQUE(org_id, wacid)`; `recordCallEvent` idempotente ante webhooks dobles; `TokenBucket.take()` nunca deja balance negativo.

- [ ] **Step 1: Test que falla (calls)**

```ts
// tests/unit/calls-dedup.test.ts: llamar recordCallEvent dos veces con el mismo
// evento "connect" {orgId, wacid: "wacid.1", ...} concurrentes vía Promise.all
// y verificar que solo existe 1 fila en calls para (orgId, "wacid.1").
```

- [ ] **Step 2: Schema + migración**

calls: `orgWacidUnique: uniqueIndex("calls_org_wacid_unique").on(t.orgId, t.wacid),`
`bun run db:generate` y **prepend** al SQL generado:
```sql
DELETE FROM `calls` WHERE `rowid` NOT IN (SELECT MIN(`rowid`) FROM `calls` GROUP BY `org_id`, `wacid`);
```
`bun run db:migrate`

- [ ] **Step 3: recordCallEvent idempotente**

Reordenar: intentar INSERT primero con `onConflictDoNothing({ target: [calls.orgId, calls.wacid] }).returning({ id: calls.id })`; si insertó → return. Si no (ya existía) → hacer el SELECT + UPDATE actual (líneas 32-49 de la versión vieja) sin cambios de lógica.

- [ ] **Step 4: TokenBucket sin balance negativo**

Reemplazar `take()`:
```ts
async take(n = 1): Promise<void> {
  for (;;) {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return;
    }
    const need = n - this.tokens;
    await new Promise((r) => setTimeout(r, Math.ceil((need / this.refillPerSecond) * 1000)));
  }
}
```

- [ ] **Step 5: Catches del worker con log**

En los tres catch vacíos del worker (header media ~89, template metadata ~116, inbox recording ~293) añadir `console.warn("[campaña] <qué falló>", campaignId, (e as Error)?.message);` conservando el comportamiento best-effort (catch con parámetro `e`).

- [ ] **Step 6: Verificar y commit**

Run: `bunx vitest run tests/unit/calls-dedup.test.ts && bunx vitest run tests/unit --silent` → PASS

```bash
git add -A && git commit -m "fix(robustez): calls idempotentes, rate limiter sin balance negativo, catches con log" && git push
```

---

### Task 11: Gate de módulo en APIs del agente + magic bytes en upload

**Files:**
- Modify: `src/app/api/agent/documents/route.ts`, `src/app/api/agent/media-library/route.ts`, `src/app/api/agent/payment-methods/route.ts`, `src/app/api/agent/shipping/route.ts` (todos los métodos que muten), `src/app/api/meta/upload-media/route.ts:39-45`
- Create: `src/lib/media/magic-bytes.ts`
- Test: `tests/unit/magic-bytes.test.ts` (crear)

**Interfaces:**
- Consumes: `checkModuleGate(db, orgId, "agente")` de `@/lib/billing/access` (el id de módulo es `"agente"` — verificado en `pedidos/@detail/[id]/page.tsx:22`).
- Produces: `matchesMagicBytes(mime: string, head: Uint8Array): boolean` — devuelve `true` para MIMEs sin firma conocida (no romper audio).

- [ ] **Step 1: Gate en las 4 rutas del agente**

En cada route handler (POST/PUT/DELETE), después de `const { orgId } = await requireOrg();`:
```ts
import { checkModuleGate } from "@/lib/billing/access";
// ...
if (!(await checkModuleGate(db, orgId, "agente"))) {
  return NextResponse.json({ error: "Tu plan no incluye el agente IA." }, { status: 403 });
}
```

- [ ] **Step 2: Test magic bytes que falla**

```ts
// tests/unit/magic-bytes.test.ts
import { describe, expect, it } from "vitest";
import { matchesMagicBytes } from "@/lib/media/magic-bytes";

describe("matchesMagicBytes", () => {
  it("acepta firmas correctas", () => {
    expect(matchesMagicBytes("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(matchesMagicBytes("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(matchesMagicBytes("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
  });
  it("rechaza contenido que no coincide con el MIME declarado", () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(matchesMagicBytes("image/jpeg", elf)).toBe(false);
    expect(matchesMagicBytes("image/png", elf)).toBe(false);
  });
  it("deja pasar MIMEs sin firma registrada", () => {
    expect(matchesMagicBytes("audio/ogg", new Uint8Array(16))).toBe(true);
  });
});
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/media/magic-bytes.ts
// Verifica que el contenido real del archivo coincida con el MIME declarado.
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  "video/mp4": (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  "video/3gpp": (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};

export function matchesMagicBytes(mime: string, head: Uint8Array): boolean {
  const check = SIGNATURES[mime];
  if (!check) return true;
  return head.length >= 12 && check(head);
}
```
En `upload-media/route.ts`, tras validar tamaño:
```ts
const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
if (!matchesMagicBytes(file.type, head)) {
  return NextResponse.json({ ok: false, error: "El contenido del archivo no coincide con su tipo." }, { status: 400 });
}
```

- [ ] **Step 4: Verificar y commit**

Run: `bunx vitest run tests/unit/magic-bytes.test.ts && bunx tsc --noEmit` → PASS

```bash
git add -A && git commit -m "fix(security): gate de plan en APIs del agente y magic bytes en upload de media" && git push
```

---

### Task 12: Landing estática (ISR) — el fix de LCP más grande

**Files:**
- Modify: `src/app/(marketing)/page.tsx` (quitar `getSession`), `src/app/(marketing)/_components/nav.tsx` (sesión client-side)

**Interfaces:**
- Consumes: `useSession` de `@/lib/auth/client` (better-auth/react, ya exportado en `client.ts:9`).
- Produces: `Nav` sin props (`export function Nav()`); la página exporta `export const revalidate = 3600`.
- Por qué: `getSession()` en la página fuerza render dinámico → prod sirve la landing con `cache-control: no-store` (verificado con curl). Quitándolo + ISR, el HTML queda cacheado.

- [ ] **Step 1: Nav con sesión client-side**

En `nav.tsx`: quitar `NavProps`/`loggedIn` prop y usar:
```tsx
import { useSession } from "@/lib/auth/client";

export function Nav() {
  const { data: session } = useSession();
  const loggedIn = !!session;
  // ...resto igual (el JSX ya usa `loggedIn` para decidir "Entrar" vs "Ir al panel")
}
```
El estado inicial (anónimo) renderiza "Entrar"; al resolver la sesión cambia a "Ir al panel" — parpadeo aceptable.

- [ ] **Step 2: Página estática**

En `page.tsx`:
- Quitar `import { getSession }`, `const session = await getSession()`, `const loggedIn = !!session`.
- `<Nav loggedIn={loggedIn} />` → `<Nav />`.
- `grep -n "loggedIn\|session" 'src/app/(marketing)/page.tsx'` — si algún CTA del hero/footer también usa `loggedIn`, extraer ese CTA a un pequeño client component que use `useSession` (mismo patrón del Nav). No dejar ningún uso server-side de sesión.
- Añadir arriba: `export const revalidate = 3600;` (el catálogo de planes viene de la DB y puede cambiar; 1h de frescura basta).

- [ ] **Step 3: Verificar build y salida estática**

Run: `bun run build`
Expected: en el resumen del build, la ruta `/` aparece como estática/ISR (símbolo `●`/revalidate), NO `ƒ (Dynamic)`. Si sigue dinámica, buscar qué más la fuerza (`grep -rn "cookies()\|headers()\|force-dynamic" 'src/app/(marketing)/'`) y resolverlo.
Luego `bun run start` y `curl -sI http://localhost:3000/ | grep -i cache-control` → ya NO debe decir `no-store`.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(marketing)/page.tsx' 'src/app/(marketing)/_components/nav.tsx'
git commit -m "perf(landing): render estatico ISR — sesion pasa al cliente" && git push
```

---

### Task 13: Perf y a11y de la landing

**Files:**
- Modify: `src/components/ui/text-hover-effect.tsx`, `src/app/(marketing)/_components/shot.tsx`, `src/app/(marketing)/page.tsx` (primer `<Shot>`), `src/app/(marketing)/_components/faq.tsx:48`

**Interfaces:**
- Consumes: `useReducedMotion` de `"motion/react"` (GOTCHA histórico: NO de "react").
- Produces: `Shot` acepta prop opcional `priority?: boolean` que pasa a `next/image`.

- [ ] **Step 1: TextHoverEffect — rAF + reduced motion**

Leer el archivo completo (134 líneas) y aplicar:
1. Eliminar el estado `cursor` y el `useEffect` derivado; calcular `maskPosition` directo en un handler con rAF-throttle:
```tsx
const rafRef = useRef<number | null>(null);
const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
  const { clientX, clientY } = e;
  if (rafRef.current !== null) return;
  rafRef.current = requestAnimationFrame(() => {
    rafRef.current = null;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMaskPosition({
      cx: `${((clientX - rect.left) / rect.width) * 100}%`,
      cy: `${((clientY - rect.top) / rect.height) * 100}%`,
    });
  });
}, []);
useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);
```
2. `const reduced = useReducedMotion();` — si `reduced`: no registrar `onMouseMove`, y las animaciones `strokeDashoffset`/gradient de los `<motion.text>` pasan a estado final estático (`animate` con los valores finales y `transition={{ duration: 0 }}`).
3. La animación de trazo (duration 4s por defecto) arranca con `delay: 0.6` para no competir con el LCP.

- [ ] **Step 2: Shot con priority + will-change**

En `shot.tsx`: añadir prop `priority?: boolean` y pasarla al `<Image ... priority={priority} />`; en el wrapper con el transform 3D del hover añadir `will-change: transform` solo cuando no hay reduced motion (ya usa un check de hover — mantener el patrón del archivo).
En `page.tsx`: al PRIMER `<Shot>` del documento (captura `/shots/campanas.png`, ~línea 204) añadir `priority`.

- [ ] **Step 3: Contraste + aria**

- `grep -n "text-neutral-400" 'src/app/(marketing)/page.tsx' 'src/app/(marketing)/_components/'*.tsx` — cada uso sobre fondo blanco/claro pasa a `text-neutral-500`; los usos sobre la sección oscura (bloque "describe→formulario") se quedan.
- `faq.tsx:48`: `<ChevronDown ... aria-hidden="true" />` y confirmar que el botón del acordeón tiene `aria-expanded` (ya lo tenía; si falta, añadirlo).

- [ ] **Step 4: Verificar y commit**

Run: `bunx tsc --noEmit && bun run lint && bun run build` → OK. Smoke visual: `bun run dev`, abrir `http://localhost:3000/` y comprobar que el wordmark LULA sigue el cursor con suavidad y que con `prefers-reduced-motion` (emular en DevTools) queda estático.

```bash
git add -A && git commit -m "perf(landing): rAF en wordmark, reduced-motion, priority LCP, contraste AA" && git push
```

---

### Task 14: Inbox — polling eficiente + virtualización de la lista

**Files:**
- Modify: `src/app/(app)/inbox/_components/poller.tsx`, `src/app/(app)/inbox/_components/conversation-list-pane.tsx` (polling ~103-120 y el render de la lista ~313)
- Add dep: `@tanstack/react-virtual`

**Interfaces:**
- Consumes: estructura actual de `data.conversations` y el item de lista existente (no cambiar su markup interno).
- Nota: el `Poller` del hilo refresca los server components de TODA la ruta (incluida la lista) cada 5s, y la lista además hace su propio fetch cada 5s → duplicado. Se mantiene el Poller a 5s (mensajes nuevos son lo crítico) y la lista baja a 15s.

- [ ] **Step 1: Polling**

- `poller.tsx`: al `if (!document.hidden)` añadir `&& navigator.onLine`.
- `conversation-list-pane.tsx`: intervalo de 5000 → 15000 y añadir `navigator.onLine` al guard.

- [ ] **Step 2: Virtualización**

```bash
bun add @tanstack/react-virtual
```
En `conversation-list-pane.tsx`, envolver el contenedor scrolleable de la lista:
```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: data.conversations.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 72, // medir la altura real del item en DevTools y ajustar
  overscan: 10,
});
```
```tsx
<div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
  <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
    {rowVirtualizer.getVirtualItems().map((v) => {
      const conv = data.conversations[v.index];
      return (
        <div key={conv.id} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}>
          {/* item existente sin cambios */}
        </div>
      );
    })}
  </div>
</div>
```
Respetar las clases del contenedor scrolleable actual (que la lista ya tiene overflow propio); solo se introduce la capa virtual.

- [ ] **Step 3: Verificar**

Run: `bunx tsc --noEmit && bun run lint && bunx vitest run` → OK.
Smoke: `bun run dev`, abrir `/inbox`, verificar scroll fluido, selección de conversación, filtros y que el borde/estado activo del item se ve igual.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "perf(inbox): lista virtualizada y polling con guard de red (lista a 15s)" && git push
```

---

### Task 15: Verificación integral, deploy y chequeo de prod

**Files:**
- Read: `deploy/deploy.sh` (confirmar si corre migraciones drizzle; el deploy hace `rm -rf $DIR/src $DIR/drizzle` antes de extraer — las migraciones nuevas SÍ llegan)

**Interfaces:** N/A — gate final.

- [ ] **Step 1: Suite completa local**

```bash
bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build
```
Expected: todo verde. Si algo falla → volver a la task correspondiente, no parchear aquí.

- [ ] **Step 2: Git limpio y pusheado**

```bash
git status -s   # limpio (salvo contact-avatar.tsx si quedó como WIP intencional)
git push
```

- [ ] **Step 3: Deploy**

Leer `deploy/deploy.sh` para confirmar el flujo (build remoto). Ejecutar:
```bash
bash deploy/deploy.sh
```
Si el deploy NO corre `db:migrate` automáticamente, conectarse al server (las señas están en deploy.sh) y ejecutar en el dir de la app: `npm run db:migrate` (o `npx drizzle-kit migrate`) ANTES de reiniciar el servicio. Las migraciones incluyen los DELETE de dedup — son idempotentes y seguras sobre datos reales.

- [ ] **Step 4: Higiene de datos post-migración (contadores históricos)**

En el server, sobre la DB de prod (con backup previo `cp data.db data.db.bak-$(date +%F)`):
```sql
UPDATE campaigns SET
  delivered = (SELECT COUNT(*) FROM message_events me JOIN campaign_recipients cr ON cr.wamid = me.wamid AND cr.campaign_id = campaigns.id WHERE me.event = 'delivered'),
  read_count = (SELECT COUNT(*) FROM message_events me JOIN campaign_recipients cr ON cr.wamid = me.wamid AND cr.campaign_id = campaigns.id WHERE me.event = 'read'),
  failed = (SELECT COUNT(*) FROM message_events me JOIN campaign_recipients cr ON cr.wamid = me.wamid AND cr.campaign_id = campaigns.id WHERE me.event = 'failed');
```
(Tras el dedup del índice único, cada evento cuenta una sola vez → contadores fieles.)

- [ ] **Step 5: Verificación de prod**

```bash
curl -sI https://luladev.com/ | grep -iE "cache-control|strict-transport|x-frame|x-powered|x-content"
# Esperado: HSTS + X-Frame + nosniff presentes, SIN x-powered-by, cache-control ya NO "no-store"
curl -s -o /dev/null -w "%{http_code}\n" https://luladev.com/api/webhook-admin   # esperado: 307→login o 404, NO contenido público
curl -s -o /dev/null -w "%{http_code}\n" "https://luladev.com/shots/panel.png"  # 200 (sigue pública)
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://luladev.com/    # 200, más rápido que los ~2.1s pre-fix
```
Y funcional: login → /panel carga; /inbox lista conversaciones; enviar un mensaje de prueba al número de WhatsApp del sandbox y verificar que entra al inbox (webhook vivo tras quitar el logging).

- [ ] **Step 6: Reporte final**

Resumir: hallazgos corregidos, tests añadidos, resultado de los curl de prod, y pendientes aceptados (virtualización medida, riesgo residual DNS-rebinding, recompute de `replied` histórico no incluido — no hay join fiable por campaña para replies antiguos).
