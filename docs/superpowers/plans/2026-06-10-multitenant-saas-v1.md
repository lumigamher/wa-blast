# wa-blast SaaS multitenant self-service v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro público por-org + suscripción EfiPay (paidUntil ledger) + panel super admin + despliegue a vps-prod-01 detrás de Caddy en luladev.com.

**Architecture:** Cada signup sin invitación crea su propia org (reemplaza first-user-wins). Una tabla `subscriptions` con `paidUntil` es la fuente de verdad de activación; los webhooks de EfiPay y el panel admin solo "aplican cargos" idempotentes que extienden esa fecha. Las server actions de envío/creación se gatean server-side con `hasActiveSubscription`. EfiPay queda aislado en `src/lib/billing/efipay.ts` (la doc pública es incompleta — cualquier ajuste de contrato toca solo ese archivo).

**Tech Stack:** Next 16 App Router (Node runtime, Bun solo como package manager), Better Auth + plugin organization, Drizzle + better-sqlite3, Vitest, EfiPay Colombia (efipay.co), Caddy + systemd en vps-prod-01.

**Spec:** `docs/superpowers/specs/2026-06-10-multitenant-saas-design.md`

**Convenciones del repo (leer antes de empezar):**
- Tests: `bun run test` (vitest run). DB de test: `makeTestDb()` de `src/lib/db/test-db.ts` (in-memory + migraciones reales). ⚠️ vitest se cuelga si hay un `next-server` stale corriendo — matarlo antes.
- Drizzle client usa `casing: "snake_case"` — definir columnas sin nombre explícito está bien, pero sigue el estilo de `src/lib/db/schema/domain.ts`.
- ⚠️ iCloud reinyecta duplicados `"* 2.ts"` — si tsc falla raro, `find src -name "* 2.*" -delete && rm -rf .next`.
- Lint: `bun run lint`. Commits frecuentes, mensajes en español como el historial.

---

### Task 1: Schema de billing (subscriptions, charges, checkouts, app_config)

**Files:**
- Modify: `src/lib/db/schema/domain.ts` (añadir 4 tablas al final)
- Create: migración vía `bun run db:generate`

- [ ] **Step 1: Añadir tablas al schema**

En `src/lib/db/schema/domain.ts`, importando lo ya importado en el archivo (`sqliteTable`, `text`, `integer`, `index`, y la tabla `organization` de `./auth`), añadir al final:

```typescript
export const subscriptions = sqliteTable("subscriptions", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["none", "active", "suspended"] })
    .notNull()
    .default("none"),
  paidUntil: integer("paid_until", { mode: "timestamp" }),
  efipaySubscriptionId: text("efipay_subscription_id"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const subscriptionCharges = sqliteTable("subscription_charges", {
  // id = transaction_id de EfiPay o "manual_<uuid>" — PK da idempotencia
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  amountCop: integer("amount_cop"),
  source: text("source", { enum: ["efipay", "manual"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const billingCheckouts = sqliteTable("billing_checkouts", {
  // id = transaction_id devuelto al generar el checkout → el webhook resuelve la org
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
```

- [ ] **Step 2: Generar migración y verificar**

Run: `bun run db:generate`
Expected: nueva migración en `drizzle/migrations/0002_*.sql` con las 4 tablas.

- [ ] **Step 3: Verificar que los tests existentes siguen verdes** (makeTestDb corre migraciones reales)

Run: `bun run test`
Expected: todos pasan (69+).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/
git commit -m "feat(billing): schema de suscripciones, cargos, checkouts y app_config"
```

---

### Task 2: Core de suscripciones (`paidUntil` ledger, idempotente)

**Files:**
- Create: `src/lib/billing/subscription.ts`
- Test: `tests/unit/subscription.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

```typescript
// tests/unit/subscription.test.ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import {
  applyCharge,
  getSubscription,
  hasActiveSubscription,
  setSuspended,
} from "@/lib/billing/subscription";

async function seedOrg(db: any, id = "org1") {
  await db.insert(organization).values({
    id,
    name: id,
    slug: id,
    createdAt: new Date(),
  });
  return id;
}

describe("subscription ledger", () => {
  it("org sin filas no está activa", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    expect(await hasActiveSubscription(db, orgId)).toBe(false);
    expect((await getSubscription(db, orgId)).status).toBe("none");
  });

  it("applyCharge activa y extiende 30 días desde ahora", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    const r = await applyCharge(db, {
      orgId,
      chargeId: "txn_1",
      source: "efipay",
      amountCop: 250000,
    });
    expect(r.applied).toBe(true);
    expect(await hasActiveSubscription(db, orgId)).toBe(true);
    const days =
      (r.paidUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("cargos se acumulan desde paidUntil vigente (no desde hoy)", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    await applyCharge(db, { orgId, chargeId: "a", source: "manual" });
    const r2 = await applyCharge(db, { orgId, chargeId: "b", source: "manual" });
    const days =
      (r2.paidUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(59);
  });

  it("mismo chargeId dos veces NO extiende doble (idempotencia)", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    const r1 = await applyCharge(db, { orgId, chargeId: "dup", source: "efipay" });
    const r2 = await applyCharge(db, { orgId, chargeId: "dup", source: "efipay" });
    expect(r2.applied).toBe(false);
    expect(r2.paidUntil.getTime()).toBe(r1.paidUntil.getTime());
  });

  it("paidUntil en el pasado = inactiva", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    await applyCharge(db, { orgId, chargeId: "x", source: "manual", days: -1 });
    expect(await hasActiveSubscription(db, orgId)).toBe(false);
    expect((await getSubscription(db, orgId)).status).toBe("expired");
  });

  it("suspendida = inactiva aunque paidUntil sea futuro", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    await applyCharge(db, { orgId, chargeId: "y", source: "manual" });
    await setSuspended(db, orgId, true);
    expect(await hasActiveSubscription(db, orgId)).toBe(false);
    await setSuspended(db, orgId, false);
    expect(await hasActiveSubscription(db, orgId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `bunx vitest run tests/unit/subscription.test.ts`
Expected: FAIL — módulo `@/lib/billing/subscription` no existe.

- [ ] **Step 3: Implementación**

```typescript
// src/lib/billing/subscription.ts
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { subscriptionCharges, subscriptions } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
export const PERIOD_DAYS = 30;

export type SubscriptionState = {
  status: "none" | "active" | "expired" | "suspended";
  paidUntil: Date | null;
};

export async function getSubscription(
  db: DB,
  orgId: string,
): Promise<SubscriptionState> {
  const row = (
    await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId))
  )[0];
  if (!row) return { status: "none", paidUntil: null };
  if (row.status === "suspended")
    return { status: "suspended", paidUntil: row.paidUntil };
  if (!row.paidUntil) return { status: "none", paidUntil: null };
  return row.paidUntil.getTime() > Date.now()
    ? { status: "active", paidUntil: row.paidUntil }
    : { status: "expired", paidUntil: row.paidUntil };
}

export async function hasActiveSubscription(
  db: DB,
  orgId: string,
): Promise<boolean> {
  return (await getSubscription(db, orgId)).status === "active";
}

export async function applyCharge(
  db: DB,
  input: {
    orgId: string;
    chargeId: string;
    source: "efipay" | "manual";
    amountCop?: number;
    days?: number;
  },
): Promise<{ applied: boolean; paidUntil: Date }> {
  const days = input.days ?? PERIOD_DAYS;
  const now = new Date();

  const inserted = await db
    .insert(subscriptionCharges)
    .values({
      id: input.chargeId,
      orgId: input.orgId,
      amountCop: input.amountCop ?? null,
      source: input.source,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  const existing = (
    await db.select().from(subscriptions).where(eq(subscriptions.orgId, input.orgId))
  )[0];

  if (inserted.length === 0) {
    // cargo ya aplicado antes — no extender
    return { applied: false, paidUntil: existing?.paidUntil ?? now };
  }

  const base =
    existing?.paidUntil && existing.paidUntil.getTime() > now.getTime()
      ? existing.paidUntil
      : now;
  const paidUntil = new Date(base.getTime() + days * DAY_MS);

  await db
    .insert(subscriptions)
    .values({ orgId: input.orgId, status: "active", paidUntil, updatedAt: now })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: { status: "active", paidUntil, updatedAt: now },
    });

  return { applied: true, paidUntil };
}

export async function setSuspended(
  db: DB,
  orgId: string,
  suspended: boolean,
): Promise<void> {
  const now = new Date();
  await db
    .insert(subscriptions)
    .values({
      orgId,
      status: suspended ? "suspended" : "active",
      paidUntil: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: { status: suspended ? "suspended" : "active", updatedAt: now },
    });
}
```

Nota: si `DB` no está exportado desde `src/lib/db/client.ts`, usar el mismo tipo que usan `src/lib/org/settings.ts` y `src/lib/media/store.ts` (mismo import).

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/unit/subscription.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/subscription.ts tests/unit/subscription.test.ts
git commit -m "feat(billing): ledger de suscripción paidUntil con cargos idempotentes"
```

---

### Task 3: Precio del plan configurable (app_config)

**Files:**
- Create: `src/lib/billing/config.ts`
- Test: `tests/unit/billing-config.test.ts`

- [ ] **Step 1: Test que falla**

```typescript
// tests/unit/billing-config.test.ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import {
  DEFAULT_PLAN_PRICE_COP,
  getPlanPriceCop,
  setPlanPriceCop,
} from "@/lib/billing/config";

describe("billing config", () => {
  it("devuelve el default si no hay valor", async () => {
    const { db } = makeTestDb();
    expect(await getPlanPriceCop(db)).toBe(DEFAULT_PLAN_PRICE_COP);
  });

  it("set + get round-trip", async () => {
    const { db } = makeTestDb();
    await setPlanPriceCop(db, 300000);
    expect(await getPlanPriceCop(db)).toBe(300000);
    await setPlanPriceCop(db, 199000);
    expect(await getPlanPriceCop(db)).toBe(199000);
  });

  it("rechaza valores no positivos", async () => {
    const { db } = makeTestDb();
    await expect(setPlanPriceCop(db, 0)).rejects.toThrow();
    await expect(setPlanPriceCop(db, -5)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

```typescript
// src/lib/billing/config.ts
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { appConfig } from "@/lib/db/schema";

export const DEFAULT_PLAN_PRICE_COP = 250000; // placeholder editable desde /admin
const KEY = "plan_price_cop";

export async function getPlanPriceCop(db: DB): Promise<number> {
  const row = (
    await db.select().from(appConfig).where(eq(appConfig.key, KEY))
  )[0];
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PLAN_PRICE_COP;
}

export async function setPlanPriceCop(db: DB, value: number): Promise<void> {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("Precio inválido");
  await db
    .insert(appConfig)
    .values({ key: KEY, value: String(Math.round(value)) })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: String(Math.round(value)) },
    });
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/config.ts tests/unit/billing-config.test.ts
git commit -m "feat(billing): precio del plan configurable en app_config"
```

---

### Task 4: Signup público — cada usuario nuevo crea SU org

**Files:**
- Modify: `src/lib/auth/hooks.ts` (reemplazar `assignFirstUserToDefaultOrg`)
- Modify: `src/lib/auth/server.ts` (llamada en `databaseHooks.user.create.after`)
- Test: `tests/integration/first-user-org.test.ts` (reescribir)

Comportamiento actual: primer usuario crea org "default"; los siguientes se UNEN a esa org (modelo single-tenant). Nuevo comportamiento SaaS: **todo usuario nuevo crea su propia org** (slug único derivado del email). Los invitados de equipo además aceptan la invitación después (página `/aceptar-invitacion/[id]` hace `setActive` a la org del invitador — eso ya funciona y no se toca; quedan con su org propia vacía además, aceptable en v1).

- [ ] **Step 1: Reescribir el test de integración (falla primero)**

Reemplazar el contenido de `tests/integration/first-user-org.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { member, organization, user } from "@/lib/db/schema";
import { createOrgForNewUser } from "@/lib/auth/hooks";

async function seedUser(db: any, id: string, email: string) {
  await db.insert(user).values({
    id,
    email,
    name: email.split("@")[0],
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id, email, name: email.split("@")[0] };
}

describe("createOrgForNewUser", () => {
  it("cada usuario nuevo obtiene su propia org como owner", async () => {
    const { db } = makeTestDb();
    const u1 = await seedUser(db, "u1", "ana@negocio.co");
    const u2 = await seedUser(db, "u2", "luis@otro.co");
    await createOrgForNewUser(db, u1);
    await createOrgForNewUser(db, u2);

    const orgs = await db.select().from(organization);
    expect(orgs.length).toBe(2);

    const m1 = (await db.select().from(member).where(eq(member.userId, "u1")))[0];
    const m2 = (await db.select().from(member).where(eq(member.userId, "u2")))[0];
    expect(m1.role).toBe("owner");
    expect(m2.role).toBe("owner");
    expect(m1.organizationId).not.toBe(m2.organizationId);
  });

  it("slugs colisionan → sufijo único", async () => {
    const { db } = makeTestDb();
    const a = await seedUser(db, "a", "ana@uno.com");
    const b = await seedUser(db, "b", "ana@dos.com");
    await createOrgForNewUser(db, a);
    await createOrgForNewUser(db, b);
    const orgs = await db.select().from(organization);
    const slugs = orgs.map((o: any) => o.slug);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs.every((s: string) => s.startsWith("ana"))).toBe(true);
  });

  it("crea organizationSettings con defaults para la org nueva", async () => {
    const { db } = makeTestDb();
    const u = await seedUser(db, "u3", "pepe@x.co");
    await createOrgForNewUser(db, u);
    const org = (await db.select().from(organization))[0];
    const { organizationSettings } = await import("@/lib/db/schema");
    const settings = (
      await db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.orgId, org.id))
    )[0];
    expect(settings).toBeTruthy();
  });

  it("es idempotente si el usuario ya tiene org", async () => {
    const { db } = makeTestDb();
    const u = await seedUser(db, "u4", "rep@x.co");
    await createOrgForNewUser(db, u);
    await createOrgForNewUser(db, u);
    expect((await db.select().from(organization)).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run** — `bunx vitest run tests/integration/first-user-org.test.ts` — Expected: FAIL (`createOrgForNewUser` no existe).

- [ ] **Step 3: Implementar en `src/lib/auth/hooks.ts`**

Reemplazar `assignFirstUserToDefaultOrg` por (conservar los imports/inserts de settings default que ya usa la función actual — copiar los values default de `organizationSettings` tal como están hoy):

```typescript
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { member, organization, organizationSettings } from "@/lib/db/schema";

function slugify(email: string): string {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return base || "org";
}

export async function createOrgForNewUser(
  db: DB,
  user: { id: string; email: string; name?: string | null },
): Promise<void> {
  const already = await db
    .select()
    .from(member)
    .where(eq(member.userId, user.id));
  if (already.length > 0) return;

  const base = slugify(user.email);
  let slug = base;
  for (let i = 2; ; i++) {
    const clash = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, slug));
    if (clash.length === 0) break;
    slug = `${base}-${i}`;
  }

  const orgId = randomUUID();
  const now = new Date();
  await db.insert(organization).values({
    id: orgId,
    name: user.name || base,
    slug,
    createdAt: now,
  });
  // mismos defaults que usaba assignFirstUserToDefaultOrg:
  await db.insert(organizationSettings).values({ orgId, updatedAt: now });
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: orgId,
    userId: user.id,
    role: "owner",
    createdAt: now,
  });
}
```

⚠️ Si el insert actual de `organizationSettings` en `hooks.ts` pasa más campos default (optoutKeywords, rateLimitMps, defaultCountry), copiarlos idénticos.

- [ ] **Step 4: Actualizar `src/lib/auth/server.ts`**

En `databaseHooks.user.create.after`, cambiar la llamada:

```typescript
after: async (user) => {
  await createOrgForNewUser(db, user);
},
```

(ajustar el import de `hooks.ts`).

- [ ] **Step 5: Run suite completa** — `bun run test` — Expected: PASS. Si otros tests dependían de `assignFirstUserToDefaultOrg` o del comportamiento "se une a la org existente", actualizarlos al comportamiento nuevo (org propia por usuario).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/ tests/integration/first-user-org.test.ts
git commit -m "feat(auth): signup SaaS — cada usuario nuevo crea su propia org"
```

---

### Task 5: Gate de suscripción en server actions

**Files:**
- Create: `src/lib/billing/gate.ts`
- Modify: `src/app/(app)/campanas/nueva/actions.ts` (`createCampaignAction`)
- Modify: `src/app/(app)/plantillas/nueva/actions.ts` (`createTemplateAction`, `createCarouselTemplateAction`, `createAuthTemplateAction`)
- Modify: `src/app/(app)/flows/nueva/actions.ts` (`generateFlowAction`, `createFlowAction`, `previewFlowAction`, `sendFlowAction`, `sendFlowBatchAction`)
- Test: `tests/integration/subscription-gate.test.ts`

NO se gatean: contactos/import/tags, configuración, equipo, favoritos, lecturas.

- [ ] **Step 1: Test del helper (falla)**

```typescript
// tests/integration/subscription-gate.test.ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { applyCharge } from "@/lib/billing/subscription";
import { checkSubscriptionGate, SUB_REQUIRED_MSG } from "@/lib/billing/gate";

describe("checkSubscriptionGate", () => {
  it("sin suscripción → bloqueado con mensaje CTA", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({
      id: "o1", name: "o1", slug: "o1", createdAt: new Date(),
    });
    const r = await checkSubscriptionGate(db, "o1");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe(SUB_REQUIRED_MSG);
  });

  it("con suscripción activa → pasa", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({
      id: "o2", name: "o2", slug: "o2", createdAt: new Date(),
    });
    await applyCharge(db, { orgId: "o2", chargeId: "c", source: "manual" });
    expect((await checkSubscriptionGate(db, "o2")).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implementar el helper**

```typescript
// src/lib/billing/gate.ts
import type { DB } from "@/lib/db/client";
import { hasActiveSubscription } from "@/lib/billing/subscription";

export const SUB_REQUIRED_MSG =
  "Tu organización no tiene una suscripción activa. Actívala en Facturación para poder enviar.";

export type GateResult = { ok: true } | { ok: false; error: string };

export async function checkSubscriptionGate(
  db: DB,
  orgId: string,
): Promise<GateResult> {
  if (await hasActiveSubscription(db, orgId)) return { ok: true };
  return { ok: false, error: SUB_REQUIRED_MSG };
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Cablear el gate en cada action listada**

Patrón — inmediatamente después del `const { orgId, session } = await requireOrg();` de cada action gateada:

```typescript
import { checkSubscriptionGate } from "@/lib/billing/gate";
// ...
const gate = await checkSubscriptionGate(db, orgId);
if (!gate.ok) return { ok: false, error: gate.error };
```

Ajustar la forma del retorno al shape de error que YA usa cada action (mirar cómo devuelve errores de validación esa misma action y usar el mismo shape; p. ej. si usa `{ error: string }` sin `ok`, seguir eso). No cambiar firmas públicas.

- [ ] **Step 6: tsc + suite completa**

Run: `bunx tsc --noEmit && bun run test`
Expected: limpio + tests verdes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/gate.ts src/app tests/integration/subscription-gate.test.ts
git commit -m "feat(billing): gate de suscripción server-side en actions de envío/creación"
```

---

### Task 6: Cliente EfiPay (aislado) + env

**Files:**
- Create: `src/lib/billing/efipay.ts`
- Modify: `src/lib/env.ts` (variables nuevas)
- Test: `tests/unit/efipay.test.ts`

⚠️ Contrato según doc pública de efipay.co (docs/1.0): Bearer token, `POST /api/v1/payment/generate-payment` (checkout redirect), webhook con header `Signature` = HMAC-SHA256 del raw body con el webhook token del dashboard. **La doc pública es incompleta** (endpoint exacto de suscripción recurrente requiere login/sandbox) — por eso TODO el contacto con EfiPay vive en este archivo. La Task 12 valida contra sandbox real y ajusta solo aquí.

- [ ] **Step 1: Añadir env vars**

En el schema zod de `src/lib/env.ts`:

```typescript
EFIPAY_API_TOKEN: z.string().optional(),
EFIPAY_OFFICE_ID: z.string().optional(),
EFIPAY_WEBHOOK_TOKEN: z.string().optional(),
EFIPAY_BASE_URL: z.string().url().default("https://efipay.co/api/v1"),
ADMIN_EMAILS: z.string().default(""),
```

- [ ] **Step 2: Tests que fallan**

```typescript
// tests/unit/efipay.test.ts
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCheckout,
  verifyWebhookSignature,
  parseWebhookEvent,
} from "@/lib/billing/efipay";

afterEach(() => vi.restoreAllMocks());

describe("efipay client", () => {
  it("createCheckout llama generate-payment con Bearer y devuelve url+id", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          checkout_url: "https://checkout.efipay.co/pay/x",
          transaction_id: "txn_9",
        }),
        { status: 200 },
      ),
    );
    const r = await createCheckout(
      { apiToken: "tok", officeId: "of1", baseUrl: "https://api.test" },
      { amountCop: 250000, description: "Suscripción wa-blast", webhookUrl: "https://luladev.com/api/webhook/efipay" },
    );
    expect(r.checkoutUrl).toBe("https://checkout.efipay.co/pay/x");
    expect(r.transactionId).toBe("txn_9");
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe("https://api.test/payment/generate-payment");
    expect((init?.headers as any).Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(init?.body));
    expect(body.amount).toBe(250000);
    expect(body.currency_type).toBe("COP");
    expect(body.checkout_type).toBe("redirect");
  });

  it("verifyWebhookSignature valida HMAC-SHA256 del raw body", () => {
    const raw = JSON.stringify({ transaction_id: "t1", status: "approved" });
    const sig = createHmac("sha256", "whtoken").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, sig, "whtoken")).toBe(true);
    expect(verifyWebhookSignature(raw, "deadbeef", "whtoken")).toBe(false);
    expect(verifyWebhookSignature(raw, null, "whtoken")).toBe(false);
  });

  it("parseWebhookEvent extrae chargeId y si es aprobado", () => {
    const ok = parseWebhookEvent({ transaction_id: "t1", status: "approved" });
    expect(ok).toEqual({ chargeId: "t1", approved: true });
    const renew = parseWebhookEvent({ transaction_id: "t2", event: "renew", status: "active" });
    expect(renew?.approved).toBe(true);
    const bad = parseWebhookEvent({ status: "rejected", transaction_id: "t3" });
    expect(bad?.approved).toBe(false);
    expect(parseWebhookEvent({})).toBeNull();
  });
});
```

- [ ] **Step 3: Run** — Expected: FAIL.

- [ ] **Step 4: Implementación**

```typescript
// src/lib/billing/efipay.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export type EfipayCreds = {
  apiToken: string;
  officeId: string;
  baseUrl: string;
};

export function efipayCredsFromEnv(): EfipayCreds | null {
  if (!env.EFIPAY_API_TOKEN || !env.EFIPAY_OFFICE_ID) return null;
  return {
    apiToken: env.EFIPAY_API_TOKEN,
    officeId: env.EFIPAY_OFFICE_ID,
    baseUrl: env.EFIPAY_BASE_URL,
  };
}

export async function createCheckout(
  creds: EfipayCreds,
  input: { amountCop: number; description: string; webhookUrl: string },
): Promise<{ checkoutUrl: string; transactionId: string }> {
  const res = await fetch(`${creds.baseUrl}/payment/generate-payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: input.description,
      amount: input.amountCop,
      currency_type: "COP",
      checkout_type: "redirect",
      office: creds.officeId,
      webhook_url: input.webhookUrl,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EfiPay ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const checkoutUrl = String(json.checkout_url ?? "");
  const transactionId = String(json.transaction_id ?? "");
  if (!checkoutUrl || !transactionId)
    throw new Error("EfiPay: respuesta sin checkout_url/transaction_id");
  return { checkoutUrl, transactionId };
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookToken: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", webhookToken)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const APPROVED = new Set(["approved", "active", "success", "paid"]);
const APPROVED_EVENTS = new Set(["renew", "renewed"]);

export function parseWebhookEvent(
  payload: unknown,
): { chargeId: string; approved: boolean } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const chargeId = String(p.transaction_id ?? p.transactionId ?? "");
  if (!chargeId) return null;
  const status = String(p.status ?? "").toLowerCase();
  const event = String(p.event ?? "").toLowerCase();
  return {
    chargeId,
    approved: APPROVED.has(status) || APPROVED_EVENTS.has(event),
  };
}
```

- [ ] **Step 5: Run** — Expected: PASS. Añadir también las env nuevas a `tests/setup.ts` si el env schema las valida en import.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/efipay.ts src/lib/env.ts tests/unit/efipay.test.ts tests/setup.ts
git commit -m "feat(billing): cliente EfiPay aislado (checkout, firma HMAC, parse de eventos)"
```

---

### Task 7: Webhook EfiPay (`/api/webhook/efipay`)

**Files:**
- Create: `src/app/api/webhook/efipay/route.ts`
- Test: `tests/integration/efipay-webhook.test.ts`

`PUBLIC_PATHS` en `src/proxy.ts` ya incluye `"/api/webhook"` (prefijo) — verificar que el match es por prefijo; si es exacto, añadir `"/api/webhook/efipay"`.

- [ ] **Step 1: Test que falla**

```typescript
// tests/integration/efipay-webhook.test.ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { billingCheckouts, organization } from "@/lib/db/schema";
import { getSubscription } from "@/lib/billing/subscription";
import { handleEfipayWebhook } from "@/app/api/webhook/efipay/route";

function signed(body: object, token = "whtoken") {
  const raw = JSON.stringify(body);
  return {
    raw,
    sig: createHmac("sha256", token).update(raw).digest("hex"),
  };
}

async function seed(db: any) {
  await db.insert(organization).values({
    id: "org1", name: "o", slug: "o", createdAt: new Date(),
  });
  await db.insert(billingCheckouts).values({
    id: "txn_1", orgId: "org1", createdAt: new Date(),
  });
}

describe("efipay webhook handler", () => {
  it("firma inválida → 401 y no activa nada", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw } = signed({ transaction_id: "txn_1", status: "approved" });
    const res = await handleEfipayWebhook(db, raw, "malasig", "whtoken");
    expect(res.status).toBe(401);
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });

  it("pago aprobado → extiende paidUntil de la org del checkout", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "txn_1", status: "approved", amount: 250000 });
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(200);
    expect((await getSubscription(db, "org1")).status).toBe("active");
  });

  it("mismo webhook dos veces → no extiende doble", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "txn_1", status: "approved" });
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    const first = (await getSubscription(db, "org1")).paidUntil!.getTime();
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect((await getSubscription(db, "org1")).paidUntil!.getTime()).toBe(first);
  });

  it("transaction_id desconocido → 200 (ack) sin efecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "nope", status: "approved" });
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(200);
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });

  it("status no aprobado → 200 sin efecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "txn_1", status: "rejected" });
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implementación**

```typescript
// src/app/api/webhook/efipay/route.ts
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { applyCharge } from "@/lib/billing/subscription";
import {
  parseWebhookEvent,
  verifyWebhookSignature,
} from "@/lib/billing/efipay";
import { db as defaultDb, type DB } from "@/lib/db/client";
import { billingCheckouts } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// exportado para tests — la lógica completa sin NextRequest
export async function handleEfipayWebhook(
  db: DB,
  rawBody: string,
  signature: string | null,
  webhookToken: string,
): Promise<{ status: number }> {
  if (!verifyWebhookSignature(rawBody, signature, webhookToken)) {
    return { status: 401 };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400 };
  }
  const event = parseWebhookEvent(payload);
  if (!event || !event.approved) return { status: 200 };

  const checkout = (
    await db
      .select()
      .from(billingCheckouts)
      .where(eq(billingCheckouts.id, event.chargeId))
  )[0];
  if (!checkout) return { status: 200 }; // ack para evitar reintentos eternos

  const amount = (payload as Record<string, unknown>).amount;
  await applyCharge(db, {
    orgId: checkout.orgId,
    chargeId: event.chargeId,
    source: "efipay",
    amountCop: typeof amount === "number" ? amount : undefined,
  });
  return { status: 200 };
}

export async function POST(req: Request) {
  const token = env.EFIPAY_WEBHOOK_TOKEN;
  if (!token) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const rawBody = await req.text();
  const signature = req.headers.get("signature");
  const result = await handleEfipayWebhook(defaultDb, rawBody, signature, token);
  return NextResponse.json({ ok: result.status === 200 }, { status: result.status });
}
```

Nota: imitar cómo `src/app/api/webhook/meta/route.ts` importa el db real (si exporta `db` con otro nombre, seguir ese patrón).

- [ ] **Step 4: Run** — Expected: PASS (5 tests). Verificar match de PUBLIC_PATHS en `src/proxy.ts` (prefijo `/api/webhook` debe cubrir `/api/webhook/efipay`; si no, añadirlo).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhook/efipay/ tests/integration/efipay-webhook.test.ts src/proxy.ts
git commit -m "feat(billing): webhook EfiPay firmado e idempotente que extiende paidUntil"
```

---

### Task 8: Página `/facturacion` + checkout + retorno + nav

**Files:**
- Create: `src/app/(app)/facturacion/page.tsx`
- Create: `src/app/(app)/facturacion/actions.ts`
- Create: `src/app/(app)/facturacion/retorno/page.tsx`
- Modify: `src/app/(app)/layout.tsx` (NAV_ITEMS)

- [ ] **Step 1: Action de checkout**

```typescript
// src/app/(app)/facturacion/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { getPlanPriceCop } from "@/lib/billing/config";
import { createCheckout, efipayCredsFromEnv } from "@/lib/billing/efipay";
import { db } from "@/lib/db/client";
import { billingCheckouts } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function startCheckoutAction(): Promise<{ error: string } | never> {
  const { orgId } = await requireOrg();
  const creds = efipayCredsFromEnv();
  if (!creds) {
    return {
      error:
        "Pagos en línea aún no configurados. Escríbenos para activar tu suscripción manualmente.",
    };
  }
  const price = await getPlanPriceCop(db);
  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;
  const { checkoutUrl, transactionId } = await createCheckout(creds, {
    amountCop: price,
    description: "Suscripción mensual wa-blast",
    webhookUrl: `${base}/api/webhook/efipay`,
  });
  await db.insert(billingCheckouts).values({
    id: transactionId,
    orgId,
    createdAt: new Date(),
  });
  redirect(checkoutUrl);
}
```

- [ ] **Step 2: Página de facturación**

Server component que muestra estado y botón. Seguir el estilo visual de las páginas existentes (mirar `src/app/(app)/configuracion/page.tsx` para clases/estructura — cards Tailwind, dark mode ya activo):

```tsx
// src/app/(app)/facturacion/page.tsx
import { requireOrg } from "@/lib/auth/session";
import { getPlanPriceCop } from "@/lib/billing/config";
import { getSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";
import { startCheckoutAction } from "./actions";

const fmtCop = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(d);

export default async function FacturacionPage() {
  const { orgId } = await requireOrg();
  const [sub, price] = await Promise.all([
    getSubscription(db, orgId),
    getPlanPriceCop(db),
  ]);

  const estado =
    sub.status === "active"
      ? `Activa hasta el ${fmtDate(sub.paidUntil!)}`
      : sub.status === "expired"
        ? `Venció el ${fmtDate(sub.paidUntil!)}`
        : sub.status === "suspended"
          ? "Suspendida — contáctanos"
          : "Sin suscripción";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Facturación</h1>
      <div className="rounded-xl border p-6 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">Estado de tu suscripción</p>
        <p className="mt-1 text-lg font-medium">{estado}</p>
      </div>
      <div className="rounded-xl border p-6 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">Plan mensual</p>
        <p className="mt-1 text-3xl font-semibold">{fmtCop(price)}</p>
        <p className="mt-1 text-sm text-neutral-500">
          Todo incluido: campañas, plantillas, carrusel y flows. Renueva cada 30 días.
        </p>
        {sub.status !== "suspended" && (
          <form action={startCheckoutAction} className="mt-4">
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              {sub.status === "active" ? "Extender 30 días" : "Activar suscripción"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

(Si `startCheckoutAction` puede devolver `{error}`, mostrarla con un client component pequeño o `useFormState` siguiendo el patrón de forms existente en el repo; mantenerlo simple.)

- [ ] **Step 3: Página de retorno**

```tsx
// src/app/(app)/facturacion/retorno/page.tsx
import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { getSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function RetornoPage() {
  const { orgId } = await requireOrg();
  const sub = await getSubscription(db, orgId);
  const ok = sub.status === "active";
  return (
    <div className="mx-auto max-w-xl p-6 text-center">
      <h1 className="text-2xl font-semibold">
        {ok ? "¡Suscripción activa! 🎉" : "Procesando tu pago…"}
      </h1>
      <p className="mt-2 text-neutral-500">
        {ok
          ? "Ya puedes crear campañas y enviar."
          : "La confirmación puede tardar unos segundos. Refresca esta página; si no se activa en unos minutos, escríbenos."}
      </p>
      <Link href={ok ? "/campanas/nueva" : "/facturacion"} className="mt-6 inline-block rounded-lg border px-4 py-2 text-sm">
        {ok ? "Crear mi primera campaña" : "Volver a Facturación"}
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Nav** — En `NAV_ITEMS` de `src/app/(app)/layout.tsx`, añadir antes de Configuración:

```typescript
{ href: "/facturacion", icon: CreditCardIcon, label: "Facturación" },
```

(import `CreditCardIcon` de lucide-react como el resto.)

- [ ] **Step 5: Verificar build + lint**

Run: `bunx tsc --noEmit && bun run lint && bun run build`
Expected: limpio.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/facturacion src/app/\(app\)/layout.tsx
git commit -m "feat(billing): página de facturación con checkout EfiPay y retorno"
```

---

### Task 9: Panel super admin `/admin`

**Files:**
- Create: `src/lib/auth/admin.ts`
- Create: `src/app/(app)/admin/page.tsx`
- Create: `src/app/(app)/admin/actions.ts`
- Modify: `src/app/(app)/layout.tsx` (link Admin condicional)
- Test: `tests/unit/admin.test.ts`

- [ ] **Step 1: Test del helper (falla)**

```typescript
// tests/unit/admin.test.ts
import { describe, expect, it } from "vitest";
import { isAdminEmail } from "@/lib/auth/admin";

describe("isAdminEmail", () => {
  it("matchea contra la lista, case-insensitive y con espacios", () => {
    const list = "luis@clonai.co, Otro@x.co";
    expect(isAdminEmail("luis@clonai.co", list)).toBe(true);
    expect(isAdminEmail("LUIS@CLONAI.CO", list)).toBe(true);
    expect(isAdminEmail("otro@x.co", list)).toBe(true);
    expect(isAdminEmail("nadie@x.co", list)).toBe(false);
    expect(isAdminEmail("luis@clonai.co", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implementar helper**

```typescript
// src/lib/auth/admin.ts
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export function isAdminEmail(email: string, list = env.ADMIN_EMAILS): boolean {
  return list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

// 404 (no 403) para no revelar que /admin existe
export async function requireAdmin() {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) notFound();
  return session;
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Actions admin**

```typescript
// src/app/(app)/admin/actions.ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { setPlanPriceCop } from "@/lib/billing/config";
import { applyCharge, setSuspended } from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";

export async function adminExtendAction(orgId: string, days: number) {
  await requireAdmin();
  if (!Number.isFinite(days) || days <= 0 || days > 365)
    return { error: "Días inválidos" };
  await applyCharge(db, {
    orgId,
    chargeId: `manual_${randomUUID()}`,
    source: "manual",
    days,
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminSetSuspendedAction(orgId: string, suspended: boolean) {
  await requireAdmin();
  await setSuspended(db, orgId, suspended);
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminSetPriceAction(priceCop: number) {
  await requireAdmin();
  try {
    await setPlanPriceCop(db, priceCop);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 6: Página admin (server component + forms con actions)**

```tsx
// src/app/(app)/admin/page.tsx
import { count, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { getPlanPriceCop } from "@/lib/billing/config";
import { db } from "@/lib/db/client";
import { member, organization, subscriptions, user } from "@/lib/db/schema";
import {
  adminExtendAction,
  adminSetPriceAction,
  adminSetSuspendedAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const price = await getPlanPriceCop(db);

  const orgs = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      subStatus: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
      members: count(member.id),
    })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.orgId, organization.id))
    .leftJoin(member, eq(member.organizationId, organization.id))
    .groupBy(organization.id)
    .orderBy(sql`${organization.createdAt} desc`);

  const fmt = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(d) : "—";
  const estado = (o: (typeof orgs)[number]) =>
    o.subStatus === "suspended"
      ? "⛔ Suspendida"
      : o.paidUntil && o.paidUntil.getTime() > Date.now()
        ? `✅ Activa → ${fmt(o.paidUntil)}`
        : o.paidUntil
          ? `🔸 Vencida ${fmt(o.paidUntil)}`
          : "— Sin sub";

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Super admin</h1>

      <section className="rounded-xl border p-4 dark:border-neutral-800">
        <h2 className="font-medium">Precio del plan (COP/mes)</h2>
        <form
          action={async (fd: FormData) => {
            "use server";
            await adminSetPriceAction(Number(fd.get("price")));
          }}
          className="mt-2 flex gap-2"
        >
          <input name="price" type="number" defaultValue={price} className="w-40 rounded border px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900" />
          <button type="submit" className="rounded bg-neutral-900 px-3 py-1 text-sm text-white dark:bg-white dark:text-neutral-900">Guardar</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Organizaciones ({orgs.length})</h2>
        <div className="overflow-x-auto rounded-xl border dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="p-3">Org</th>
                <th className="p-3">Miembros</th>
                <th className="p-3">Suscripción</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-t dark:border-neutral-800">
                  <td className="p-3">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-neutral-500">{o.slug} · {fmt(o.createdAt)}</div>
                  </td>
                  <td className="p-3">{o.members}</td>
                  <td className="p-3">{estado(o)}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <form action={async () => { "use server"; await adminExtendAction(o.id, 30); }}>
                        <button type="submit" className="rounded border px-2 py-1 text-xs dark:border-neutral-700">+30 días</button>
                      </form>
                      <form action={async () => { "use server"; await adminSetSuspendedAction(o.id, o.subStatus !== "suspended"); }}>
                        <button type="submit" className="rounded border px-2 py-1 text-xs dark:border-neutral-700">
                          {o.subStatus === "suspended" ? "Reactivar" : "Suspender"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

⚠️ Si el repo no usa inline server actions (`"use server"` dentro de la página), extraerlas como client components pequeños siguiendo el patrón de `/configuracion/equipo/_team.tsx`.

- [ ] **Step 7: Link condicional en el sidebar**

En `src/app/(app)/layout.tsx` (es server component que ya llama `requireSession`): obtener la sesión y, si `isAdminEmail(session.user.email)`, renderizar un item extra `{ href: "/admin", icon: ShieldIcon, label: "Admin" }` al final del nav.

- [ ] **Step 8: tsc + lint + suite + build**

Run: `bunx tsc --noEmit && bun run lint && bun run test && bun run build`
Expected: todo limpio.

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth/admin.ts src/app/\(app\)/admin tests/unit/admin.test.ts src/app/\(app\)/layout.tsx
git commit -m "feat(admin): panel super admin con activación manual, suspensión y precio"
```

---

### Task 10: Tests de aislamiento multi-org

**Files:**
- Test: `tests/integration/org-isolation.test.ts`

Verifica con datos en 2 orgs que las funciones de consulta/escritura usadas por las actions filtran por orgId. Usar las funciones internas reales que las actions llaman (mirar qué funciones de query usan `listContactsAction`, la página de campañas y `getOrgSettings` — importarlas y probarlas con `makeTestDb`).

- [ ] **Step 1: Escribir el test**

```typescript
// tests/integration/org-isolation.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaigns, contacts, organization } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";

async function seedTwoOrgs(db: any) {
  for (const id of ["orgA", "orgB"]) {
    await db.insert(organization).values({
      id, name: id, slug: id, createdAt: new Date(),
    });
  }
  await db.insert(contacts).values([
    { id: "cA", orgId: "orgA", phone: "+573001112233", createdAt: new Date(), updatedAt: new Date() },
    { id: "cB", orgId: "orgB", phone: "+573009998877", createdAt: new Date(), updatedAt: new Date() },
  ]);
  await db.insert(campaigns).values([
    { id: "campA", orgId: "orgA", name: "A", templateName: "t", templateLanguage: "es", status: "draft", total: 0, createdAt: new Date() },
    { id: "campB", orgId: "orgB", name: "B", templateName: "t", templateLanguage: "es", status: "draft", total: 0, createdAt: new Date() },
  ]);
}

describe("aislamiento multi-org", () => {
  it("contactos de orgA no aparecen consultando orgB", async () => {
    const { db } = makeTestDb();
    await seedTwoOrgs(db);
    const rows = await db.select().from(contacts).where(eq(contacts.orgId, "orgB"));
    expect(rows.map((r: any) => r.id)).toEqual(["cB"]);
  });

  it("campañas filtran por org", async () => {
    const { db } = makeTestDb();
    await seedTwoOrgs(db);
    const rows = await db.select().from(campaigns).where(eq(campaigns.orgId, "orgA"));
    expect(rows.map((r: any) => r.id)).toEqual(["campA"]);
  });

  it("getOrgSettings de orgA nunca devuelve credenciales de orgB", async () => {
    const { db } = makeTestDb();
    await seedTwoOrgs(db);
    const { saveMetaCreds } = await import("@/lib/org/settings");
    await saveMetaCreds(db, "orgB", {
      metaPhoneId: "111", metaWabaId: "222", metaAppId: "333",
      metaAccessToken: "secretB", metaAppSecret: "appsecretB",
    } as any);
    const a = await getOrgSettings(db, "orgA");
    expect(a.metaAccessToken).toBeNull();
    const b = await getOrgSettings(db, "orgB");
    expect(b.metaAccessToken).toBe("secretB");
  });
});
```

Ajustar las columnas NOT NULL de los inserts a lo que exija el schema real (mirar `domain.ts`); ajustar la firma de `saveMetaCreds` a la real.

**Además (revisión manual como parte de esta task):** grep de todas las queries en `src/app/**/actions.ts` y `src/app/**/page.tsx` buscando `db.select().from(` y verificar que cada una sobre tablas con `orgId` incluye `eq(<tabla>.orgId, orgId)`. Si aparece alguna sin filtro, corregirla en esta task y añadir test.

- [ ] **Step 2: Run** — `bunx vitest run tests/integration/org-isolation.test.ts` — Expected: PASS (si algo falla, es un hallazgo real: corregir la query).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/org-isolation.test.ts
git commit -m "test: aislamiento multi-org en contactos, campañas y settings"
```

---

### Task 11: Artefactos de despliegue (deploy.sh, systemd, Caddy, backup)

**Files:**
- Create: `deploy/wa-blast.service`
- Create: `deploy/Caddyfile.snippet`
- Create: `deploy/deploy.sh`
- Create: `deploy/backup-db.sh`
- Create: `docs/ONBOARDING.md`
- Modify: `.gitignore` si hace falta (no debe ignorar `deploy/`)

- [ ] **Step 1: systemd unit**

```ini
# deploy/wa-blast.service  →  /etc/systemd/system/wa-blast.service
[Unit]
Description=wa-blast (Next.js, Node)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wa-blast
# .env.local lo lee Next; HOSTNAME/PORT fuerzan bind local (nunca 0.0.0.0 — kinsing may-2026)
Environment=NODE_ENV=production
Environment=PORT=3010
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -p 3010 -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Caddy snippet**

```caddyfile
# deploy/Caddyfile.snippet → añadir al Caddyfile del VPS (158.220.123.213)
luladev.com {
	encode gzip
	reverse_proxy 127.0.0.1:3010
}
```

- [ ] **Step 3: deploy.sh** (patrón milujo: git archive | tar, sin .git, excluye .env*)

```bash
#!/usr/bin/env bash
# deploy/deploy.sh — desplegar wa-blast a vps-prod-01
set -euo pipefail

HOST="${WA_BLAST_HOST:-root@158.220.123.213}"
DIR=/opt/wa-blast

echo "→ Empaquetando main y subiendo…"
git archive main | ssh "$HOST" "mkdir -p $DIR && tar -x -C $DIR"

echo "→ Build remoto…"
ssh "$HOST" "cd $DIR && \
  bun install --frozen-lockfile && \
  rm -rf .next/cache && \
  bun run build && \
  bunx drizzle-kit migrate && \
  systemctl restart wa-blast && \
  sleep 3 && systemctl is-active wa-blast"

echo "→ Health check…"
ssh "$HOST" "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/login" | grep -q 200 \
  && echo "✅ wa-blast desplegado y sirviendo" \
  || { echo "❌ health check falló"; exit 1; }
```

Notas: el server necesita node + bun instalados (vps-prod-01 ya los tiene por milujo). `git archive` NO incluye `.env*` no trackeados (verificado por diseño: nunca trackearlos). `better-sqlite3` compila addon nativo en `bun install` — si falla, `npm rebuild better-sqlite3` en el server.

- [ ] **Step 4: backup script + cron**

```bash
#!/usr/bin/env bash
# deploy/backup-db.sh → /usr/local/bin/wa-blast-backup (cron diario 03:30)
set -euo pipefail
mkdir -p /var/backups/wa-blast
sqlite3 /var/lib/wa-blast/data.db ".backup /var/backups/wa-blast/data-$(date +%F).db"
# conservar 14 días
find /var/backups/wa-blast -name 'data-*.db' -mtime +14 -delete
```

Cron (se instala en Task 12): `30 3 * * * /usr/local/bin/wa-blast-backup`

- [ ] **Step 5: docs/ONBOARDING.md** — flujo del operador:

```markdown
# Onboarding manual de un cliente (v1)

1. El cliente entra a https://luladev.com/signup y se registra (su org se crea sola)
   — o tú lo invitas desde /configuracion/equipo de una org que crees para él.
2. El cliente (o tú) carga sus credenciales Meta en /configuracion/meta
   (phone ID, WABA ID, App ID, access token, app secret — cifradas por-org).
3. Pago: el cliente paga en /facturacion (EfiPay) → se activa solo.
   Pago por fuera (Nequi/transferencia): /admin → su org → "+30 días".
4. Verificar en /salud que la conexión Meta responde.
```

- [ ] **Step 6: Commit**

```bash
chmod +x deploy/deploy.sh deploy/backup-db.sh
git add deploy/ docs/ONBOARDING.md
git commit -m "feat(deploy): systemd + Caddy + deploy script + backup para vps-prod-01"
```

---

### Task 12: Despliegue real a vps-prod-01 (requiere a Luis)

**Bloqueado por Luis:** (a) DNS A record `luladev.com` → 158.220.123.213, (b) credenciales EfiPay (API token prod + sandbox, Office ID, Webhook token — rotadas tras la infección de mayo), (c) confirmar su correo para `ADMIN_EMAILS`.

- [ ] **Step 1: Preparar server** (ssh con llave `id_ed25519_2026-05-01`):

```bash
ssh root@158.220.123.213 "mkdir -p /opt/wa-blast /var/lib/wa-blast/media /var/backups/wa-blast"
```

- [ ] **Step 2: Crear `/opt/wa-blast/.env.local` EN EL SERVER** (nunca por rsync/scp de un .env local — regla del repo):

```bash
# generar secretos en la Mac y pegarlos por ssh manualmente:
openssl rand -base64 48   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (exacto 32 bytes base64)
```

Contenido de `.env.local` en el server:

```
NODE_ENV=production
DATABASE_URL=/var/lib/wa-blast/data.db
MEDIA_DIR=/var/lib/wa-blast/media
BETTER_AUTH_SECRET=<generado>
BETTER_AUTH_URL=https://luladev.com
PUBLIC_BASE_URL=https://luladev.com
ENCRYPTION_KEY=<generado>
RESEND_API_KEY=<de Luis>
EMAIL_FROM=wa-blast <no-reply@luladev.com>
ADMIN_EMAILS=<correo de Luis>
EFIPAY_API_TOKEN=<de Luis>
EFIPAY_OFFICE_ID=<de Luis>
EFIPAY_WEBHOOK_TOKEN=<de Luis>
OPENAI_API_KEY=<de Luis, para Generar Flow con IA — opcional>
OPENAI_MODEL=gpt-5-mini
```

⚠️ Resend: el dominio del `EMAIL_FROM` debe estar verificado en Resend (si no, usar uno ya verificado de Luis, p. ej. clonai.co).

- [ ] **Step 3: Instalar systemd + Caddy + cron**

```bash
scp deploy/wa-blast.service root@158.220.123.213:/etc/systemd/system/
scp deploy/backup-db.sh root@158.220.123.213:/usr/local/bin/wa-blast-backup
ssh root@158.220.123.213 "chmod +x /usr/local/bin/wa-blast-backup && \
  (crontab -l; echo '30 3 * * * /usr/local/bin/wa-blast-backup') | sort -u | crontab - && \
  systemctl daemon-reload && systemctl enable wa-blast"
# Añadir el bloque de deploy/Caddyfile.snippet al Caddyfile del server y:
ssh root@158.220.123.213 "caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"
```

- [ ] **Step 4: Primer deploy**

Run: `bash deploy/deploy.sh`
Expected: "✅ wa-blast desplegado y sirviendo". Luego verificar desde fuera: `curl -sI https://luladev.com/login` → 200 (requiere DNS ya propagado; Caddy emite el cert solo).

- [ ] **Step 5: Smoke test producción**

1. Signup con un correo de prueba → entra y ve su org vacía.
2. `/campanas/nueva` → crear campaña debe BLOQUEAR con mensaje de suscripción.
3. Login con el correo de `ADMIN_EMAILS` → `/admin` visible → "+30 días" a la org de prueba.
4. La org de prueba ya puede crear campaña (sin enviar — sin creds Meta).
5. Con otro usuario NO admin, `https://luladev.com/admin` → 404.

- [ ] **Step 6: Commit de cualquier ajuste + actualizar memoria del proyecto.**

---

### Task 13: Verificación EfiPay en sandbox (con creds reales)

**Bloqueado por Luis:** token de prueba EfiPay. La doc pública no muestra el contrato exacto de suscripción recurrente — esta task lo valida y ajusta SOLO `src/lib/billing/efipay.ts`.

- [ ] **Step 1:** Con el token test, llamar `POST {base}/payment/generate-payment` real (curl) y comparar la respuesta con lo que asume `createCheckout` (nombres `checkout_url`/`transaction_id`, base URL real del API — confirmar si es `https://efipay.co/api/v1` u otro host). Ajustar `efipay.ts` + tests si difiere.
- [ ] **Step 2:** Completar un pago sandbox end-to-end: checkout → webhook recibido en `https://luladev.com/api/webhook/efipay` → verificar en `/admin` que la org extendió 30 días. Revisar el header real de firma (¿`Signature`? ¿otro nombre?) y el payload real del evento; ajustar `parseWebhookEvent`/`verifyWebhookSignature` si difiere.
- [ ] **Step 3:** Investigar en el dashboard EfiPay (con Luis) el flujo de **suscripción recurrente nativa** (plan + subscribe). Si existe endpoint utilizable: crear el plan mensual con el precio configurado y cambiar `startCheckoutAction` para usarlo (el webhook `renew` ya extiende por diseño). Si NO es utilizable vía API: documentar en el spec que v1 queda con re-pago manual mensual (el diseño ya lo soporta) y abrir issue para v1.1.
- [ ] **Step 4:** Commit final + actualizar `docs/superpowers/specs/2026-06-10-multitenant-saas-design.md` con el contrato real verificado.

---

## Self-review (hecho al escribir)

- **Cobertura del spec:** registro por-org (T4), modo limitado/gate (T5), suscripciones paidUntil+EfiPay (T1-T3, T6-T8), webhook firmado+idempotente (T7), admin con activación manual/suspender/precio (T9), 404 en admin (T9), aislamiento multi-org (T10), systemd 127.0.0.1 + Caddy + datos en /var/lib + backup + deploy script (T11-T12), env producción (T12), verificación EfiPay (T13), onboarding doc (T11). Crear-org-desde-admin del spec se cubre con el flujo "el cliente se registra y tú lo extiendes" + invitaciones existentes (decisión YAGNI: el admin no duplica el signup).
- **Tipos consistentes:** `applyCharge/getSubscription/hasActiveSubscription/setSuspended` (T2) usados en T5/T7/T9; `checkSubscriptionGate` (T5) en actions; `createCheckout/verifyWebhookSignature/parseWebhookEvent/efipayCredsFromEnv` (T6) en T7/T8.
- **Adaptación al repo:** donde el plan no pudo ver el código exacto (shapes de retorno de actions, defaults de organizationSettings, export del tipo DB), la instrucción es explícita: copiar el patrón existente del archivo tocado.
