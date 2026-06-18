# Gestión de campañas programadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cancelar, eliminar, reprogramar y editar campañas programadas en wa-blast (Lula), y arreglar el cron de prod para que las programadas se disparen solas.

**Architecture:** Lógica de gestión en `src/lib/campaigns/manage.ts` (funciones puras `(db, orgId, …) → Result`, unit-testables con `makeTestDb()`); server actions finas en `src/app/(app)/campanas/[id]/actions.ts` que envuelven con `requireOrg()` + `revalidatePath`; UI cliente en `campaign-actions.tsx` con `Dialog` de confirmación. El "editar" reusa el wizard existente vía `?from=<id>` + borrado del draft origen al guardar. Cron arreglado con un systemd timer en prod.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM, better-sqlite3, Vitest, Base-UI/shadcn (`Dialog`), systemd.

## Global Constraints

- Runtime en prod: **bun**; servicio systemd `wa-blast` en `:3010`, host `root@158.220.123.213`, dir `/opt/wa-blast`, DB en `/var/lib/wa-blast`.
- Tests con **Vitest** (`bun run test`); tests de lógica usan `makeTestDb()` y prueban funciones de `lib/`, **no** las server actions (que requieren sesión).
- **better-sqlite3 rechaza funciones async dentro de transacciones** — no usar `await` dentro de `db.transaction(async …)`.
- Multi-tenancy: toda mutación verifica `campaign.orgId === orgId` antes de tocar nada.
- Estados de campaña: `draft` → `queued` → `sending` → `done`/`failed`; nuevo: `cancelled` (solo desde `draft`).
- Mensajes de error y copy de UI en **español**.
- `foreign_keys = ON` está activo (cliente y test-db), por lo que borrar `campaigns` arrastra `campaign_recipients` por cascade.

---

### Task 1: `cancelCampaign` (lib)

**Files:**
- Create: `src/lib/campaigns/manage.ts`
- Test: `tests/integration/campaigns-manage.test.ts`

**Interfaces:**
- Consumes: `makeTestDb` de `@/lib/db/test-db`; `campaigns`, `campaignRecipients`, `organization`, `user` de `@/lib/db/schema`.
- Produces: `export type ManageResult = { ok: true } | { ok: false; error: string }`; `export async function cancelCampaign(db: DB, orgId: string, id: string): Promise<ManageResult>`. (`DB` = `import type { DB } from "@/lib/db/client"` — mismo tipo que usan `create.ts`/`worker.ts`.)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaigns, campaignRecipients, organization, user } from "@/lib/db/schema";
import { cancelCampaign } from "@/lib/campaigns/manage";

async function seedCampaign(status: string, scheduledAt: Date | null = null) {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  await db.insert(organization).values({ id: "o2", name: "O2", createdAt: new Date() });
  await db.insert(user).values({ id: "u", email: "u@x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(campaigns).values({
    id: "camp1", orgId: "o", name: "Test", templateName: "promo", templateLanguage: "es",
    source: "adhoc", status, scheduledAt, createdBy: "u", createdAt: new Date(),
  });
  await db.insert(campaignRecipients).values({ campaignId: "camp1", phone: "+57300", params: "{}", status: "pending" });
  return { db };
}

describe("cancelCampaign", () => {
  test("draft → cancelled", async () => {
    const { db } = await seedCampaign("draft", new Date(Date.now() + 3_600_000));
    const r = await cancelCampaign(db, "o", "camp1");
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "camp1"));
    expect(c.status).toBe("cancelled");
  });

  test("rechaza si no es draft", async () => {
    const { db } = await seedCampaign("sending");
    const r = await cancelCampaign(db, "o", "camp1");
    expect(r.ok).toBe(false);
  });

  test("rechaza cross-org", async () => {
    const { db } = await seedCampaign("draft");
    const r = await cancelCampaign(db, "o2", "camp1");
    expect(r.ok).toBe(false);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "camp1"));
    expect(c.status).toBe("draft");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- campaigns-manage`
Expected: FAIL (`cancelCampaign` no existe / módulo no encontrado).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaigns } from "@/lib/db/schema";

export type ManageResult = { ok: true } | { ok: false; error: string };

async function loadOwned(db: DB, orgId: string, id: string) {
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!camp || camp.orgId !== orgId) return null;
  return camp;
}

export async function cancelCampaign(db: DB, orgId: string, id: string): Promise<ManageResult> {
  const camp = await loadOwned(db, orgId, id);
  if (!camp) return { ok: false, error: "Campaña no encontrada" };
  if (camp.status !== "draft") {
    return { ok: false, error: "Solo se pueden cancelar campañas programadas que aún no han salido" };
  }
  await db.update(campaigns).set({ status: "cancelled" }).where(eq(campaigns.id, id));
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- campaigns-manage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/manage.ts tests/integration/campaigns-manage.test.ts
git commit -m "feat(campaigns): cancelCampaign (draft → cancelled, guard org+estado)"
```

---

### Task 2: `deleteCampaign` (lib)

**Files:**
- Modify: `src/lib/campaigns/manage.ts`
- Test: `tests/integration/campaigns-manage.test.ts` (añadir describe)

**Interfaces:**
- Consumes: `loadOwned`, `ManageResult` de Task 1.
- Produces: `export async function deleteCampaign(db: DB, orgId: string, id: string): Promise<ManageResult>`.

- [ ] **Step 1: Write the failing test** (añadir al archivo de test)

```typescript
import { deleteCampaign } from "@/lib/campaigns/manage";

describe("deleteCampaign", () => {
  test("borra draft y sus destinatarios (cascade)", async () => {
    const { db } = await seedCampaign("draft");
    const r = await deleteCampaign(db, "o", "camp1");
    expect(r.ok).toBe(true);
    expect(await db.select().from(campaigns).where(eq(campaigns.id, "camp1"))).toHaveLength(0);
    expect(await db.select().from(campaignRecipients).where(eq(campaignRecipients.campaignId, "camp1"))).toHaveLength(0);
  });

  test("borra cancelled/done/failed", async () => {
    for (const s of ["cancelled", "done", "failed"]) {
      const { db } = await seedCampaign(s);
      expect((await deleteCampaign(db, "o", "camp1")).ok).toBe(true);
    }
  });

  test("rechaza queued/sending", async () => {
    for (const s of ["queued", "sending"]) {
      const { db } = await seedCampaign(s);
      const r = await deleteCampaign(db, "o", "camp1");
      expect(r.ok).toBe(false);
      expect(await db.select().from(campaigns).where(eq(campaigns.id, "camp1"))).toHaveLength(1);
    }
  });

  test("rechaza cross-org", async () => {
    const { db } = await seedCampaign("draft");
    expect((await deleteCampaign(db, "o2", "camp1")).ok).toBe(false);
    expect(await db.select().from(campaigns).where(eq(campaigns.id, "camp1"))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- campaigns-manage`
Expected: FAIL (`deleteCampaign` no existe).

- [ ] **Step 3: Write minimal implementation** (añadir a `manage.ts`)

```typescript
const DELETABLE = new Set(["draft", "cancelled", "done", "failed"]);

export async function deleteCampaign(db: DB, orgId: string, id: string): Promise<ManageResult> {
  const camp = await loadOwned(db, orgId, id);
  if (!camp) return { ok: false, error: "Campaña no encontrada" };
  if (!DELETABLE.has(camp.status)) {
    return { ok: false, error: "No se puede eliminar una campaña en curso" };
  }
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- campaigns-manage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/manage.ts tests/integration/campaigns-manage.test.ts
git commit -m "feat(campaigns): deleteCampaign (hard delete + cascade, bloquea en curso)"
```

---

### Task 3: `rescheduleCampaign` (lib)

**Files:**
- Modify: `src/lib/campaigns/manage.ts`
- Test: `tests/integration/campaigns-manage.test.ts`

**Interfaces:**
- Consumes: `loadOwned`, `ManageResult`.
- Produces: `export async function rescheduleCampaign(db: DB, orgId: string, id: string, scheduledAtIso: string): Promise<ManageResult>`.

- [ ] **Step 1: Write the failing test**

```typescript
import { rescheduleCampaign } from "@/lib/campaigns/manage";

describe("rescheduleCampaign", () => {
  test("draft + fecha futura → actualiza scheduledAt", async () => {
    const { db } = await seedCampaign("draft", new Date(Date.now() + 3_600_000));
    const future = new Date(Date.now() + 7_200_000).toISOString();
    const r = await rescheduleCampaign(db, "o", "camp1", future);
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "camp1"));
    expect(c.scheduledAt?.toISOString()).toBe(future);
  });

  test("rechaza fecha pasada", async () => {
    const { db } = await seedCampaign("draft");
    const r = await rescheduleCampaign(db, "o", "camp1", new Date(Date.now() - 3_600_000).toISOString());
    expect(r.ok).toBe(false);
  });

  test("rechaza si no es draft", async () => {
    const { db } = await seedCampaign("sending");
    const r = await rescheduleCampaign(db, "o", "camp1", new Date(Date.now() + 3_600_000).toISOString());
    expect(r.ok).toBe(false);
  });

  test("rechaza cross-org", async () => {
    const { db } = await seedCampaign("draft");
    const r = await rescheduleCampaign(db, "o2", "camp1", new Date(Date.now() + 3_600_000).toISOString());
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- campaigns-manage`
Expected: FAIL (`rescheduleCampaign` no existe).

- [ ] **Step 3: Write minimal implementation** (añadir a `manage.ts`)

```typescript
export async function rescheduleCampaign(
  db: DB,
  orgId: string,
  id: string,
  scheduledAtIso: string,
): Promise<ManageResult> {
  const camp = await loadOwned(db, orgId, id);
  if (!camp) return { ok: false, error: "Campaña no encontrada" };
  if (camp.status !== "draft") {
    return { ok: false, error: "Solo se pueden reprogramar campañas que aún no han salido" };
  }
  const when = new Date(scheduledAtIso);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "La fecha programada debe ser a futuro" };
  }
  await db.update(campaigns).set({ scheduledAt: when }).where(eq(campaigns.id, id));
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- campaigns-manage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/manage.ts tests/integration/campaigns-manage.test.ts
git commit -m "feat(campaigns): rescheduleCampaign (draft + valida fecha futura)"
```

---

### Task 4: Server actions (wrappers)

**Files:**
- Modify: `src/app/(app)/campanas/[id]/actions.ts`

**Interfaces:**
- Consumes: `cancelCampaign`, `deleteCampaign`, `rescheduleCampaign`, `ManageResult` de `@/lib/campaigns/manage`; `requireOrg` de `@/lib/auth/session`; `revalidatePath` de `next/cache`.
- Produces: `cancelCampaignAction(id: string): Promise<ManageResult>`, `deleteCampaignAction(id: string): Promise<ManageResult>`, `rescheduleCampaignAction(id: string, scheduledAtIso: string): Promise<ManageResult>`.

- [ ] **Step 1: Añadir imports y las tres actions al final de `[id]/actions.ts`**

```typescript
// añadir a los imports existentes:
import { revalidatePath } from "next/cache";
import { cancelCampaign, deleteCampaign, rescheduleCampaign, type ManageResult } from "@/lib/campaigns/manage";

export async function cancelCampaignAction(id: string): Promise<ManageResult> {
  const { orgId } = await requireOrg();
  const r = await cancelCampaign(db, orgId, id);
  if (r.ok) revalidatePath("/campanas");
  return r;
}

export async function deleteCampaignAction(id: string): Promise<ManageResult> {
  const { orgId } = await requireOrg();
  const r = await deleteCampaign(db, orgId, id);
  if (r.ok) revalidatePath("/campanas");
  return r;
}

export async function rescheduleCampaignAction(id: string, scheduledAtIso: string): Promise<ManageResult> {
  const { orgId } = await requireOrg();
  const r = await rescheduleCampaign(db, orgId, id, scheduledAtIso);
  if (r.ok) revalidatePath("/campanas");
  return r;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bunx tsc --noEmit`
Expected: sin errores nuevos en `actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/campanas/[id]/actions.ts"
git commit -m "feat(campaigns): server actions cancelar/eliminar/reprogramar"
```

---

### Task 5: Filtros de lista + badge `cancelled`

**Files:**
- Modify: `src/app/(app)/campanas/page.tsx`

**Interfaces:**
- Consumes: actions de Task 4 (sólo a través del componente de Task 6); este task sólo cambia filtros y badge.
- Produces: nada nuevo exportado; la sección "Programadas" ahora incluye `draft` sin `scheduledAt`; `cancelled` cae en "Finalizadas".

- [ ] **Step 1: Cambiar los filtros (líneas ~26-28)**

```typescript
  const scheduled = all.filter((c) => c.status === "draft"); // incluye drafts sin fecha (atascados)
  const running = all.filter((c) => c.status === "queued" || c.status === "sending");
  const done = all.filter((c) => c.status === "done" || c.status === "failed" || c.status === "cancelled");
```

- [ ] **Step 2: Añadir caso `cancelled` al `StatusBadge` (función al final del archivo)**

```typescript
function StatusBadge({ status }: { status: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "done"
      ? "default"
      : status === "failed"
        ? "destructive"
        : status === "sending"
          ? "secondary"
          : "outline";
  const label = status === "cancelled" ? "cancelada" : status;
  return <Badge variant={variant}>{label}</Badge>;
}
```

- [ ] **Step 3: En `ScheduledRow`, mostrar "sin programar" cuando no hay fecha** (el componente ya hace fallback `"pronto"`; cambiarlo a `"sin programar"`)

```typescript
          <LocalDateTime iso={when ? when.toISOString() : null} fallback="sin programar" /> · {c.total}{" "}
```

- [ ] **Step 4: Verificar build/tipos**

Run: `bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/campanas/page.tsx"
git commit -m "feat(campaigns): lista muestra drafts sin fecha y estado cancelada"
```

---

### Task 6: UI de acciones (cliente)

**Files:**
- Create: `src/app/(app)/campanas/campaign-actions.tsx`
- Modify: `src/app/(app)/campanas/page.tsx` (montar el componente en `ScheduledRow` y `CampaignRow`)

**Interfaces:**
- Consumes: `cancelCampaignAction`, `deleteCampaignAction`, `rescheduleCampaignAction` de `./[id]/actions`; `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`/`DialogTrigger` de `@/components/ui/dialog`; `Button` de `@/components/ui/button`; `Input` de `@/components/ui/input`; `toast` de `sonner`; `useRouter` de `next/navigation`.
- Produces: `export function CampaignActions({ id, status, scheduledAt }: { id: string; status: string; scheduledAt: number | null })`.

- [ ] **Step 1: Crear `campaign-actions.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, XCircle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  cancelCampaignAction, deleteCampaignAction, rescheduleCampaignAction,
} from "./[id]/actions";

function toLocalInput(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampaignActions({
  id, status, scheduledAt,
}: { id: string; status: string; scheduledAt: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openResched, setOpenResched] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [when, setWhen] = useState(toLocalInput(scheduledAt));

  const isDraft = status === "draft";
  const canDelete = ["draft", "cancelled", "done", "failed"].includes(status);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, close: () => void) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(okMsg);
        close();
        router.refresh();
      } else {
        toast.error(r.error ?? "Error");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      {isDraft && (
        <Button variant="ghost" size="sm" title="Editar"
          onClick={() => router.push(`/campanas/nueva?from=${id}`)}>
          <Pencil className="size-4" />
        </Button>
      )}

      {isDraft && (
        <Dialog open={openResched} onOpenChange={setOpenResched}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" title="Reprogramar"><CalendarClock className="size-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Reprogramar campaña</DialogTitle></DialogHeader>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenResched(false)}>Cancelar</Button>
              <Button disabled={pending || !when}
                onClick={() => run(
                  () => rescheduleCampaignAction(id, new Date(when).toISOString()),
                  "Campaña reprogramada", () => setOpenResched(false),
                )}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isDraft && (
        <Dialog open={openCancel} onOpenChange={setOpenCancel}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" title="Cancelar envío"><XCircle className="size-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>¿Cancelar esta campaña?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">No se enviará. Quedará registrada como cancelada.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCancel(false)}>Volver</Button>
              <Button disabled={pending}
                onClick={() => run(() => cancelCampaignAction(id), "Campaña cancelada", () => setOpenCancel(false))}>
                Cancelar campaña
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canDelete && (
        <Dialog open={openDelete} onOpenChange={setOpenDelete}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" title="Eliminar"><Trash2 className="size-4 text-destructive" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>¿Eliminar esta campaña?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Se borra de forma permanente, junto con sus destinatarios.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDelete(false)}>Volver</Button>
              <Button variant="destructive" disabled={pending}
                onClick={() => run(() => deleteCampaignAction(id), "Campaña eliminada", () => setOpenDelete(false))}>
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montar en `page.tsx`** — añadir el import y renderizar dentro de `ScheduledRow` (después del Badge de plantilla) y de `CampaignRow` (en el header, sólo cuando `canDelete`). En ambos pasar `scheduledAt={c.scheduledAt ? c.scheduledAt.getTime() : null}`.

```typescript
import { CampaignActions } from "./campaign-actions";
// dentro de ScheduledRow, tras el <Badge> de templateName:
<CampaignActions id={c.id} status={c.status} scheduledAt={c.scheduledAt ? c.scheduledAt.getTime() : null} />
// dentro de CampaignRow, tras <StatusBadge>:
<CampaignActions id={c.id} status={c.status} scheduledAt={c.scheduledAt ? c.scheduledAt.getTime() : null} />
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: sin errores.

- [ ] **Step 4: Verificación manual (dev)**

Run: `bun run dev`, abrir `/campanas`. Confirmar: campaña draft muestra iconos Editar/Reprogramar/Cancelar/Eliminar; reprogramar abre diálogo con fecha; eliminar pide confirmación y, al confirmar, la fila desaparece (toast "Campaña eliminada"). Una campaña `done` sólo muestra Eliminar.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/campanas/campaign-actions.tsx" "src/app/(app)/campanas/page.tsx"
git commit -m "feat(campaigns): UI cancelar/reprogramar/eliminar/editar en la lista"
```

---

### Task 7: Editar = relanzar wizard prefijado + borrar draft origen

**Files:**
- Modify: `src/app/(app)/campanas/nueva/actions.ts` (campo `replacesDraftId`)
- Modify: `src/app/(app)/campanas/nueva/page.tsx` (leer `?from`, precargar campos)
- Modify: `src/app/(app)/campanas/nueva/wizard.tsx` (aceptar props de precarga + `replacesDraftId`, enviarlo en el submit)

**Interfaces:**
- Consumes: `deleteCampaign` de `@/lib/campaigns/manage` (en la action); `campaigns` schema.
- Produces: `createCampaignAction` acepta `replacesDraftId?: string` en su input; el wizard acepta props `initial?: { name; templateName; templateLanguage; templateType; componentPlanJson; scheduledAt } ` y `replacesDraftId?: string`.

- [ ] **Step 1: `actions.ts` — añadir `replacesDraftId` al schema y borrar el draft tras crear**

```typescript
// en inputSchema, junto a force:
  replacesDraftId: z.string().optional(),
// importar arriba:
import { deleteCampaign } from "@/lib/campaigns/manage";
// justo antes de `return { ok: true, campaignId, scheduled: ... }`:
  if (data.replacesDraftId) {
    await deleteCampaign(db, orgId, data.replacesDraftId); // guard de org dentro
  }
```

- [ ] **Step 2: `nueva/page.tsx` — leer `?from` y precargar**

Leer `searchParams.from`; si existe, `db.select().from(campaigns).where(and(eq(campaigns.id, from), eq(campaigns.orgId, orgId)))`; si es draft, pasar al wizard `initial={{ name, templateName, templateLanguage, templateType, componentPlanJson, scheduledAt: scheduledAt?.toISOString() ?? null }}` y `replacesDraftId={from}`. (Seguir el patrón de lectura de `searchParams` que ya use el repo en Next 16 — `searchParams` es async/Promise.)

```typescript
// firma de la página en Next 16:
export default async function NuevaPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { orgId } = await requireOrg();
  const { from } = await searchParams;
  let initial: WizardInitial | undefined;
  let replacesDraftId: string | undefined;
  if (from) {
    const [d] = await db.select().from(campaigns).where(and(eq(campaigns.id, from), eq(campaigns.orgId, orgId)));
    if (d && d.status === "draft") {
      initial = {
        name: d.name, templateName: d.templateName, templateLanguage: d.templateLanguage,
        templateType: (d.templateType as "standard" | "carousel" | "flow") ?? "standard",
        componentPlanJson: d.componentPlanJson, scheduledAt: d.scheduledAt?.toISOString() ?? null,
      };
      replacesDraftId = from;
    }
  }
  // …pasar initial y replacesDraftId al <Wizard/>
}
```

- [ ] **Step 3: `wizard.tsx` — aceptar props y enviar `replacesDraftId`**

Añadir al tipo de props del wizard `initial?: WizardInitial` y `replacesDraftId?: string`; inicializar los estados de `name`/`templateName`/`templateLanguage`/`templateType`/`scheduledAt` desde `initial` cuando exista; en el objeto que se pasa a `createCampaignAction`, incluir `replacesDraftId`. Exportar `type WizardInitial`. (Los destinatarios NO se precargan — el usuario los reselecciona; es el trade-off aceptado.)

- [ ] **Step 4: Verificar tipos**

Run: `bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Verificación manual (dev)**

Run: `bun run dev`. En `/campanas`, clic en Editar de un draft → wizard abre con nombre/plantilla/fecha precargados. Completar destinatarios y guardar → nueva campaña creada y el draft original desaparece de la lista.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/campanas/nueva/actions.ts" "src/app/(app)/campanas/nueva/page.tsx" "src/app/(app)/campanas/nueva/wizard.tsx"
git commit -m "feat(campaigns): editar draft relanza wizard prefijado y borra el origen al guardar"
```

---

### Task 8: Fix del cron en prod (systemd timer)

**Files:**
- Create: `deploy/setup-cron.sh`

**Interfaces:**
- Consumes: endpoint existente `GET /api/cron/run-scheduled?secret=$CRON_SECRET` (`:3010`); `CRON_SECRET` en `/opt/wa-blast/.env.local`.
- Produces: `wa-blast-cron.service` + `wa-blast-cron.timer` activos en prod (cada minuto).

- [ ] **Step 1: Crear `deploy/setup-cron.sh`**

```bash
#!/usr/bin/env bash
# deploy/setup-cron.sh — instala el systemd timer que dispara las campañas programadas.
# Idempotente. Se corre una vez (o tras cambiar CRON_SECRET).
set -euo pipefail
HOST="${WA_BLAST_HOST:-root@158.220.123.213}"
DIR=/opt/wa-blast
PORT=3010

ssh "$HOST" "bash -s" <<EOF
set -euo pipefail
cd $DIR
# 1) Asegurar CRON_SECRET en .env.local
if ! grep -q '^CRON_SECRET=' .env.local 2>/dev/null; then
  SECRET=\$(openssl rand -hex 24)
  echo "CRON_SECRET=\$SECRET" >> .env.local
  echo "→ CRON_SECRET generado; reinicia wa-blast para que Next lo lea"
  systemctl restart wa-blast
  sleep 3
fi

# 2) Unidades systemd
cat > /etc/systemd/system/wa-blast-cron.service <<UNIT
[Unit]
Description=wa-blast dispara campañas programadas
After=network.target
[Service]
Type=oneshot
EnvironmentFile=$DIR/.env.local
ExecStart=/usr/bin/curl -fsS "http://127.0.0.1:$PORT/api/cron/run-scheduled?secret=\\\${CRON_SECRET}"
UNIT

cat > /etc/systemd/system/wa-blast-cron.timer <<UNIT
[Unit]
Description=Ejecuta wa-blast-cron cada minuto
[Timer]
OnCalendar=*:0/1
Persistent=true
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now wa-blast-cron.timer
echo "→ timer instalado:"
systemctl list-timers wa-blast-cron.timer --no-pager
EOF
```

- [ ] **Step 2: Hacer ejecutable y correr** (requiere autorización de prod de Luis — ya dada con "hazlo")

```bash
chmod +x deploy/setup-cron.sh && ./deploy/setup-cron.sh
```
Expected: lista el timer `wa-blast-cron.timer` con próxima ejecución en <1 min.

- [ ] **Step 3: Verificar que el endpoint responde**

```bash
ssh root@158.220.123.213 'set -a; . /opt/wa-blast/.env.local; set +a; curl -fsS "http://127.0.0.1:3010/api/cron/run-scheduled?secret=$CRON_SECRET"'
```
Expected: `{"ok":true,"triggered":[...]}`.

- [ ] **Step 4: Commit**

```bash
git add deploy/setup-cron.sh
git commit -m "chore(deploy): systemd timer que dispara campañas programadas en prod"
```

---

### Task 9: Suite completa + despliegue

- [ ] **Step 1: Suite completa verde**

Run: `bun run test`
Expected: todos los tests pasan (incluye los nuevos de `campaigns-manage`).

- [ ] **Step 2: Lint + typecheck**

Run: `bunx tsc --noEmit && bun run lint`
Expected: limpio.

- [ ] **Step 3: Desplegar**

Run: `./deploy/deploy.sh`
Expected: `✅ wa-blast desplegado y sirviendo (login 200)`.

- [ ] **Step 4: Verificación en prod**

Abrir `https://luladev.com/campanas`, confirmar que las campañas de prueba atascadas se pueden eliminar y que aparecen los drafts sin fecha. Eliminar las de prueba.

---

## Self-Review

- **Cobertura del spec:** §1 modelo (`cancelled`, sin migración) → Tasks 1,5. §2 server actions → Tasks 1-4. §3 UI → Tasks 5,6. §4 editar opción 1 → Task 7. §5 cron → Task 8. §6 limpieza de prueba → Task 9 step 4 (vía UI de Task 6). Pruebas §Pruebas → Tasks 1-3 (lib). Cubierto.
- **Placeholders:** ninguno; todo el código está escrito salvo el detalle de retrofit del wizard (Task 7 step 3) que es descriptivo por la extensión del archivo (1023 líneas) — el implementador edita estados existentes, no escribe de cero.
- **Consistencia de tipos:** `ManageResult` definido en Task 1, reusado en Tasks 2-4. `CampaignActions` props `{ id, status, scheduledAt: number | null }` consistente entre Task 6 def y montaje. `replacesDraftId` consistente entre `inputSchema` (Task 7.1), `page.tsx` (7.2) y `wizard.tsx` (7.3).
