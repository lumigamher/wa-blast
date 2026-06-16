# Módulo de Contactos mejorado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Lula alta manual de contactos, más campos (empresa, notas, cumpleaños, ciudad), drawer de vistazo y una ficha de contacto editable en `/contactos/[id]`.

**Architecture:** Columnas aditivas en `contacts` + una capa pura `src/lib/contacts/mutations.ts` (testeable con `makeTestDb`) envuelta por server actions con `requireOrg()`. UI: modal de alta, drawer (Sheet) de peek y página de detalle SSR.

**Tech Stack:** Next.js 15 (App Router), better-sqlite3 + Drizzle, Vitest, zod 4, shadcn/ui, lucide-react, libphonenumber-js.

**Spec:** `docs/superpowers/specs/2026-06-15-contactos-module-design.md`

**Convenciones del repo (ya verificadas):**
- DB type: `import type { DB } from "@/lib/db/client"`. Schema barrel: `@/lib/db/schema`.
- Tests viven en `tests/unit/*.test.ts`. Correr todo: `bun run test`. Uno: `bunx vitest run tests/unit/<file>.test.ts`.
- Typecheck: `bunx tsc --noEmit`. Lint: `bun run lint`.
- `makeTestDb()` migra desde `drizzle/migrations`, así que **las columnas nuevas deben estar en una migración generada** antes de que pasen los tests.
- Seed de org en tests: `await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() })`.
- FK están ON (client y test) → borrar un contacto cae en cascade sobre `contact_tags`.
- `normalizePhone(input, defaultCountry)` → `string | null`. `getOrgSettings(db, orgId).defaultCountry`.
- zod 4: usar `z.email()` (no `z.string().email()`).

> ⚠️ **Coordinación con la sesión paralela de Calling API:** la Task 1 genera una migración drizzle. Si la otra sesión ya generó una migración (tabla `calls`), inspeccionar `drizzle/migrations/meta/_journal.json` y renumerar/regenerar para que el journal quede secuencial. No commitear directorios duplicados por iCloud (`migrations 2`).

---

## File Structure

- **Modify** `src/lib/db/schema/domain.ts` — 4 columnas nuevas en `contacts`.
- **Create** `drizzle/migrations/XXXX_*.sql` (+ snapshot/journal) — vía `db:generate`.
- **Create** `src/lib/contacts/mutations.ts` — CRUD puro de contactos + tags por org.
- **Create** `tests/unit/contact-mutations.test.ts` — tests de la capa pura.
- **Modify** `src/app/(app)/contactos/actions.ts` — server actions nuevas + `email`/`company` en `ContactWithTags`.
- **Create** `src/components/ui/sheet.tsx` — primitiva drawer (shadcn).
- **Create** `src/app/(app)/contactos/_nuevo-contacto-dialog.tsx` — modal de alta.
- **Create** `src/app/(app)/contactos/_contacto-peek.tsx` — drawer de vistazo/edición.
- **Modify** `src/app/(app)/contactos/page.tsx` — botón Nuevo, columna Empresa, filas que abren el peek.
- **Create** `src/app/(app)/contactos/[id]/page.tsx` — ficha completa SSR.
- **Create** `src/app/(app)/contactos/[id]/_ficha.tsx` — cliente de edición de la ficha.

---

## Task 1: Schema + migración (columnas nuevas)

**Files:**
- Modify: `src/lib/db/schema/domain.ts:21-38`
- Create: `drizzle/migrations/*` (generado)

- [ ] **Step 1: Añadir columnas a `contacts`**

En `src/lib/db/schema/domain.ts`, dentro de `export const contacts = sqliteTable("contacts", { ... })`, añadir tras `email: text("email"),`:

```ts
    company: text("company"),
    notes: text("notes"),
    birthday: text("birthday"),
    city: text("city"),
```

- [ ] **Step 2: Generar la migración**

Run: `bun run db:generate`
Expected: crea un archivo en `drizzle/migrations/` con `ALTER TABLE contacts ADD ...` para las 4 columnas. Revisar que **solo** toca `contacts` (no otras tablas). Si aparece un dir duplicado `migrations 2`, borrarlo.

- [ ] **Step 3: Verificar que los tests existentes siguen migrando**

Run: `bunx vitest run tests/unit/auto-contact.test.ts`
Expected: PASS (confirma que la migración aplica limpio en `makeTestDb`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations
git commit -m "feat(contactos): columnas company/notes/birthday/city en contacts"
```

---

## Task 2: Capa pura de mutaciones (`mutations.ts`) — TDD

**Files:**
- Create: `src/lib/contacts/mutations.ts`
- Test: `tests/unit/contact-mutations.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/contact-mutations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, contactTags, organization, tags } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";
import {
  createContact,
  updateContact,
  deleteContact,
  setContactTagsForOrg,
  getContact,
} from "@/lib/contacts/mutations";

async function seed(db: DB) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
}

describe("createContact", () => {
  it("normaliza el teléfono y crea el contacto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const res = await createContact(db, "o1", "CO", { phone: "300 123 4567", name: "Juan" });
    expect(res.ok).toBe(true);
    const [c] = await db.select().from(contacts).where(eq(contacts.orgId, "o1"));
    expect(c.phone).toBe("+573001234567");
    expect(c.name).toBe("Juan");
  });

  it("rechaza teléfono inválido", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const res = await createContact(db, "o1", "CO", { phone: "abc" });
    expect(res).toMatchObject({ ok: false });
  });

  it("rechaza email inválido", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const res = await createContact(db, "o1", "CO", { phone: "3001234567", email: "no-es-email" });
    expect(res).toMatchObject({ ok: false });
  });

  it("rechaza duplicado en el mismo org y devuelve existingId", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const a = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const b = await createContact(db, "o1", "CO", { phone: "+573001234567" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.existingId).toBe((a as { ok: true; id: string }).id);
  });

  it("permite el mismo teléfono en otro org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await createContact(db, "o1", "CO", { phone: "3001234567" });
    const res = await createContact(db, "o2", "CO", { phone: "3001234567" });
    expect(res.ok).toBe(true);
  });
});

describe("updateContact", () => {
  it("aplica patch parcial y mergea customFields", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    await updateContact(db, "o1", id, { customFields: { a: "1" } });
    await updateContact(db, "o1", id, { company: "ACME", customFields: { b: "2" } });
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(row.company).toBe("ACME");
    expect(JSON.parse(row.customFields)).toEqual({ a: "1", b: "2" });
  });

  it("no actualiza contactos de otro org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    const res = await updateContact(db, "o2", id, { name: "Hack" });
    expect(res.ok).toBe(false);
  });
});

describe("deleteContact", () => {
  it("borra el contacto y sus tags (cascade)", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    await db.insert(tags).values({ id: "t1", orgId: "o1", name: "VIP", color: "#fff" });
    await setContactTagsForOrg(db, "o1", id, ["t1"]);
    await deleteContact(db, "o1", id);
    const rows = await db.select().from(contacts).where(eq(contacts.id, id));
    const tagRows = await db.select().from(contactTags).where(eq(contactTags.contactId, id));
    expect(rows).toHaveLength(0);
    expect(tagRows).toHaveLength(0);
  });
});

describe("setContactTagsForOrg", () => {
  it("reemplaza el set y descarta tags de otro org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    await db.insert(tags).values({ id: "t1", orgId: "o1", name: "VIP", color: "#fff" });
    await db.insert(tags).values({ id: "tX", orgId: "o2", name: "Ajeno", color: "#000" });
    await setContactTagsForOrg(db, "o1", id, ["t1", "tX"]);
    const tagRows = await db.select().from(contactTags).where(eq(contactTags.contactId, id));
    expect(tagRows.map((r) => r.tagId)).toEqual(["t1"]);
  });
});

describe("getContact", () => {
  it("devuelve null si no es del org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    expect(await getContact(db, "o2", id)).toBeNull();
    const found = await getContact(db, "o1", id);
    expect(found?.tagList).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `bunx vitest run tests/unit/contact-mutations.test.ts`
Expected: FAIL ("Cannot find module '@/lib/contacts/mutations'").

- [ ] **Step 3: Implementar `mutations.ts`**

Crear `src/lib/contacts/mutations.ts`:

```ts
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db/client";
import { contacts, contactTags, conversations, tags } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/contacts/phone";

const emailSchema = z.email();

export type CreateContactInput = {
  phone: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  tagIds?: string[];
};

export type ContactPatch = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
  birthday?: string | null;
  city?: string | null;
  customFields?: Record<string, unknown>;
};

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export async function createContact(
  db: DB,
  orgId: string,
  defaultCountry: string,
  input: CreateContactInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string; existingId?: string }> {
  const phone = normalizePhone(input.phone ?? "", defaultCountry);
  if (!phone) return { ok: false, error: "Teléfono inválido" };
  const email = clean(input.email);
  if (email && !emailSchema.safeParse(email).success) {
    return { ok: false, error: "Email inválido" };
  }
  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone)));
  if (existing) return { ok: false, error: "Ya existe un contacto con ese teléfono", existingId: existing.id };

  const id = `c_${crypto.randomUUID()}`;
  const now = new Date();
  const validTags = await validTagIds(db, orgId, input.tagIds ?? []);
  db.transaction((tx) => {
    tx.insert(contacts)
      .values({
        id,
        orgId,
        phone,
        name: clean(input.name),
        email,
        company: clean(input.company),
        customFields: "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (validTags.length) {
      tx.insert(contactTags).values(validTags.map((t) => ({ contactId: id, tagId: t }))).run();
    }
  });
  return { ok: true, id };
}

export async function updateContact(
  db: DB,
  orgId: string,
  id: string,
  patch: ContactPatch,
): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)));
  if (!row) return { ok: false, error: "Contacto no encontrado" };
  if (patch.email !== undefined) {
    const email = clean(patch.email);
    if (email && !emailSchema.safeParse(email).success) return { ok: false, error: "Email inválido" };
  }
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = clean(patch.name);
  if (patch.email !== undefined) set.email = clean(patch.email);
  if (patch.company !== undefined) set.company = clean(patch.company);
  if (patch.notes !== undefined) set.notes = patch.notes ?? null;
  if (patch.birthday !== undefined) set.birthday = clean(patch.birthday);
  if (patch.city !== undefined) set.city = clean(patch.city);
  if (patch.customFields !== undefined) {
    const current = JSON.parse(row.customFields || "{}") as Record<string, unknown>;
    set.customFields = JSON.stringify({ ...current, ...patch.customFields });
  }
  await db.update(contacts).set(set).where(eq(contacts.id, id));
  return { ok: true };
}

export async function deleteContact(db: DB, orgId: string, id: string): Promise<{ ok: boolean }> {
  await db.delete(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)));
  return { ok: true };
}

async function validTagIds(db: DB, orgId: string, tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const owned = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, orgId), inArray(tags.id, tagIds)));
  const ownedIds = new Set(owned.map((t) => t.id));
  return tagIds.filter((t) => ownedIds.has(t));
}

export async function setContactTagsForOrg(
  db: DB,
  orgId: string,
  contactId: string,
  tagIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  if (!c) return { ok: false, error: "Contacto no encontrado" };
  const valid = await validTagIds(db, orgId, tagIds);
  db.transaction((tx) => {
    tx.delete(contactTags).where(eq(contactTags.contactId, contactId)).run();
    if (valid.length) {
      tx.insert(contactTags).values(valid.map((t) => ({ contactId, tagId: t }))).run();
    }
  });
  return { ok: true };
}

export async function getContact(db: DB, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)));
  if (!row) return null;
  const tagList = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(eq(contactTags.contactId, id));
  const [conversation] = await db
    .select({ id: conversations.id, lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.contactId, id)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return { ...row, tagList, conversation: conversation ?? null };
}
```

- [ ] **Step 4: Correr los tests**

Run: `bunx vitest run tests/unit/contact-mutations.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contacts/mutations.ts tests/unit/contact-mutations.test.ts
git commit -m "feat(contactos): capa pura de mutaciones (create/update/delete/tags/get) + tests"
```

---

## Task 3: Server actions

**Files:**
- Modify: `src/app/(app)/contactos/actions.ts`

- [ ] **Step 1: Exponer `email`/`company` en la lista y añadir las acciones**

En `src/app/(app)/contactos/actions.ts`:

1. Añadir imports al bloque existente:

```ts
import {
  createContact,
  updateContact,
  deleteContact,
  setContactTagsForOrg,
  getContact,
  type ContactPatch,
} from "@/lib/contacts/mutations";
```

2. Añadir `company` al tipo `ContactWithTags` (tras `email`):

```ts
	company: string | null;
```

3. En `listContactsAction`, el `return rows.map(...)` ya hace spread implícito? No — mapea campos explícitos. Añadir `company: r.company,` al objeto devuelto (junto a `email: r.email,`).

4. Añadir al final del archivo:

```ts
export async function createContactAction(input: {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  tagIds?: string[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string; existingId?: string }> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const res = await createContact(db, orgId, settings.defaultCountry, input);
  if (res.ok) revalidatePath("/contactos");
  return res;
}

export async function updateContactAction(
  id: string,
  patch: ContactPatch,
): Promise<{ ok: boolean; error?: string }> {
  const { orgId } = await requireOrg();
  const res = await updateContact(db, orgId, id, patch);
  if (res.ok) {
    revalidatePath("/contactos");
    revalidatePath(`/contactos/${id}`);
  }
  return res;
}

export async function deleteContactAction(id: string): Promise<{ ok: boolean }> {
  const { orgId } = await requireOrg();
  const res = await deleteContact(db, orgId, id);
  revalidatePath("/contactos");
  return res;
}

export async function setContactTagsAction(
  id: string,
  tagIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const { orgId } = await requireOrg();
  const res = await setContactTagsForOrg(db, orgId, id, tagIds);
  if (res.ok) {
    revalidatePath("/contactos");
    revalidatePath(`/contactos/${id}`);
  }
  return res;
}

export async function getContactAction(id: string) {
  const { orgId } = await requireOrg();
  return getContact(db, orgId, id);
}

export async function listTagsAction() {
  const { orgId } = await requireOrg();
  const { listTags } = await import("@/lib/contacts/tags");
  return listTags(db, orgId);
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (sin errores en `contactos/actions.ts`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/contactos/actions.ts"
git commit -m "feat(contactos): server actions create/update/delete/tags/get + company en lista"
```

---

## Task 4: Componente `Sheet` (drawer)

**Files:**
- Create: `src/components/ui/sheet.tsx`

- [ ] **Step 1: Instalar el componente shadcn**

Usar el MCP de shadcn para traer el componente `sheet` (no escribir props a mano). Si el MCP no está disponible, crear `src/components/ui/sheet.tsx` con la implementación estándar de shadcn (Radix `@radix-ui/react-dialog` con variantes `side`). Confirmar que `@radix-ui/react-dialog` ya es dependencia (lo usa `dialog.tsx`).

Run para confirmar dependencia: `grep radix-ui/react-dialog package.json`
Expected: aparece la dependencia (reutilizada por `dialog.tsx`).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/sheet.tsx
git commit -m "feat(ui): componente Sheet (drawer) de shadcn"
```

---

## Task 5: Modal de alta + mejoras a la lista

**Files:**
- Create: `src/app/(app)/contactos/_nuevo-contacto-dialog.tsx`
- Modify: `src/app/(app)/contactos/page.tsx`

- [ ] **Step 1: Crear el modal de alta**

Crear `src/app/(app)/contactos/_nuevo-contacto-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createContactAction } from "./actions";

export function NuevoContactoDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ msg: string; existingId?: string } | null>(null);

  async function action(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await createContactAction({
      phone: String(formData.get("phone") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      company: String(formData.get("company") ?? ""),
    });
    setPending(false);
    if (res.ok) {
      toast.success("Contacto creado");
      setOpen(false);
      router.refresh();
    } else {
      setError({ msg: res.error, existingId: res.existingId });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          Nuevo contacto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono *</Label>
            <Input id="phone" name="phone" required placeholder="+57 300 123 4567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Empresa</Label>
            <Input id="company" name="company" />
          </div>
          {error && (
            <p className="text-sm text-destructive">
              {error.msg}
              {error.existingId && (
                <>
                  {" · "}
                  <Link className="underline" href={`/contactos/${error.existingId}`}>
                    ver contacto
                  </Link>
                </>
              )}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Cablear en la lista**

En `src/app/(app)/contactos/page.tsx`:
1. Importar: `import { NuevoContactoDialog } from "./_nuevo-contacto-dialog";`
2. En el `<header>`, junto al link de importar, añadir `<NuevoContactoDialog />` (antes del link de importar).
3. Añadir columna Empresa: en `<thead>`, tras el `<th>Teléfono</th>`, añadir `<th className="text-left px-3 py-2 font-medium">Empresa</th>`. En cada `<tr>`, tras la celda de teléfono, añadir `<td className="px-3 py-2 text-muted-foreground">{r.company ?? "—"}</td>`.
4. Hacer el nombre un link a la ficha: cambiar la celda de nombre por:

```tsx
<td className="px-3 py-2">
  <Link href={`/contactos/${r.id}`} className="font-medium hover:underline">
    {r.name ?? r.phone}
  </Link>
</td>
```

(Importar `Link` ya está importado en el archivo.)

- [ ] **Step 3: Typecheck + build de la ruta**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/contactos/_nuevo-contacto-dialog.tsx" "src/app/(app)/contactos/page.tsx"
git commit -m "feat(contactos): alta manual (modal) + columna Empresa + link a ficha"
```

---

## Task 6: Ficha de contacto `/contactos/[id]`

**Files:**
- Create: `src/app/(app)/contactos/[id]/page.tsx`
- Create: `src/app/(app)/contactos/[id]/_ficha.tsx`

> Nota: el peek-drawer (Task 7) reutiliza el componente `_ficha.tsx` editor. Construir primero la página para fijar la interfaz de datos.

- [ ] **Step 1: Página SSR**

Crear `src/app/(app)/contactos/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { getContactAction, listTagsAction } from "../actions";
import { FichaContacto } from "./_ficha";

export const dynamic = "force-dynamic";

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactAction(id);
  if (!contact) notFound();
  const allTags = await listTagsAction();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/contactos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Volver a contactos
      </Link>

      <FichaContacto contact={contact} allTags={allTags} />

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Conversación</h2>
        {contact.conversation ? (
          <Link
            href={`/inbox/${contact.conversation.id}`}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <MessageCircleIcon className="size-4" />
            Abrir conversación en el inbox
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Sin conversación todavía.</p>
        )}
      </section>

      <section className="rounded-lg border border-dashed p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <PhoneIcon className="size-4" />
          Llamadas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          El historial de llamadas aparecerá aquí cuando se active la Calling API.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Editor cliente de la ficha**

Crear `src/app/(app)/contactos/[id]/_ficha.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactAvatar } from "../../inbox/[id]/_components/contact-avatar";
import {
  updateContactAction,
  deleteContactAction,
  setContactTagsAction,
} from "../actions";

type Tag = { id: string; name: string; color: string };
type Contact = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  birthday: string | null;
  city: string | null;
  tagList: Tag[];
};

export function FichaContacto({ contact, allTags }: { contact: Contact; allTags: Tag[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: contact.name ?? "",
    email: contact.email ?? "",
    company: contact.company ?? "",
    city: contact.city ?? "",
    birthday: contact.birthday ?? "",
    notes: contact.notes ?? "",
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(contact.tagList.map((t) => t.id));

  async function save() {
    setSaving(true);
    const res = await updateContactAction(contact.id, form);
    if (res.ok) await setContactTagsAction(contact.id, selectedTags);
    setSaving(false);
    if (res.ok) {
      toast.success("Guardado");
      router.refresh();
    } else {
      toast.error(res.error ?? "Error al guardar");
    }
  }

  async function remove() {
    if (!confirm("¿Borrar este contacto?")) return;
    await deleteContactAction(contact.id);
    toast.success("Contacto borrado");
    router.push("/contactos");
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ContactAvatar seed={contact.phone} name={form.name || null} size={56} />
          <div>
            <div className="text-lg font-semibold">{form.name || contact.phone}</div>
            <div className="font-mono text-xs text-muted-foreground">{contact.phone}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={remove} className="text-destructive">
          <Trash2Icon className="size-4" />
          Borrar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Empresa" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
        <Field label="Ciudad" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Field label="Cumpleaños" type="date" value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={4}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {allTags.length === 0 && <span className="text-xs text-muted-foreground">No hay tags creadas.</span>}
          {allTags.map((t) => {
            const on = selectedTags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? "bg-muted" : "opacity-60 hover:opacity-100"}`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS. (Confirma que `ContactAvatar` se importa bien desde `../../inbox/[id]/_components/contact-avatar` y acepta `seed`/`name`/`size`.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/contactos/[id]"
git commit -m "feat(contactos): ficha de contacto editable en /contactos/[id]"
```

---

## Task 7: Drawer de vistazo (peek) desde la lista

**Files:**
- Create: `src/app/(app)/contactos/_contacto-peek.tsx`
- Modify: `src/app/(app)/contactos/page.tsx`

- [ ] **Step 1: Crear el peek**

Crear `src/app/(app)/contactos/_contacto-peek.tsx`. Usa el `Sheet` de la Task 4 y reutiliza las mismas acciones. El trigger es un botón "Ver" en cada fila.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactAvatar } from "../inbox/[id]/_components/contact-avatar";
import { updateContactAction } from "./actions";

type Row = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
};

export function ContactoPeek({ row }: { row: Row }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: row.name ?? "",
    email: row.email ?? "",
    company: row.company ?? "",
  });

  async function save() {
    setSaving(true);
    const res = await updateContactAction(row.id, form);
    setSaving(false);
    if (res.ok) {
      toast.success("Guardado");
      router.refresh();
    } else {
      toast.error(res.error ?? "Error");
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          Ver
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ContactAvatar seed={row.phone} name={form.name || null} size={36} />
            <span className="truncate">{form.name || row.phone}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="font-mono text-xs text-muted-foreground">{row.phone}</div>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Link
              href={`/contactos/${row.id}`}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ficha completa
              <ExternalLinkIcon className="size-3.5" />
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

> Si los subcomponentes de `Sheet` instalados por shadcn difieren (p.ej. no exporta `SheetTrigger`), ajustar imports a los nombres reales del archivo `src/components/ui/sheet.tsx`.

- [ ] **Step 2: Añadir una columna de acción en la lista**

En `src/app/(app)/contactos/page.tsx`:
1. Importar: `import { ContactoPeek } from "./_contacto-peek";`
2. En `<thead>`, añadir al final una columna vacía: `<th className="px-3 py-2" />`.
3. En cada `<tr>`, añadir al final una celda:

```tsx
<td className="px-3 py-2 text-right">
  <ContactoPeek row={{ id: r.id, phone: r.phone, name: r.name, email: r.email, company: r.company }} />
</td>
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/contactos/_contacto-peek.tsx" "src/app/(app)/contactos/page.tsx"
git commit -m "feat(contactos): drawer de vistazo (peek) con edición rápida desde la lista"
```

---

## Task 8: Verificación final (gates)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Lint**

Run: `bun run lint`
Expected: PASS (sin errores nuevos en `contactos/**` ni `components/ui/sheet.tsx`).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Tests**

Run: `bun run test`
Expected: PASS — incluye `tests/unit/contact-mutations.test.ts` y todos los previos.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build exitoso; la ruta `/contactos/[id]` aparece como dinámica.

- [ ] **Step 5: Commit final (si quedaran ajustes)**

```bash
git add -A
git commit -m "chore(contactos): gates verdes (lint/typecheck/test/build)"
```

---

## Self-Review (cobertura del spec)

- **Columnas company/notes/birthday/city** → Task 1. ✓
- **Capa testeable de mutaciones** → Task 2 (create/update/delete/setTags/get). ✓
- **Validación teléfono/email, dup con existingId, merge customFields, aislamiento por org** → Task 2 (código + tests). ✓
- **Server actions con requireOrg + revalidate** → Task 3. ✓
- **Alta manual (modal)** → Task 5. ✓
- **Lista: columna Empresa + link a ficha + acción peek** → Tasks 5 y 7. ✓
- **Drawer peek (Sheet)** → Tasks 4 y 7. ✓
- **Ficha /contactos/[id] con todos los campos + custom fields + tags + conversación + placeholder Llamadas** → Task 6. (Nota: el editor de *custom fields* arbitrarios queda como pares en el modelo; la ficha v1 edita los campos de primera clase + notas. Si se requiere editor visual de customFields, es una extensión menor sobre `_ficha.tsx`.) ✓
- **Tests Vitest** → Task 2 + gate Task 8. ✓
- **Coordinación de migración con Calling API** → nota en cabecera + Task 1. ✓
