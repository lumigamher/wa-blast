# Catálogo interno: búsqueda + disponibilidad + carga XLSX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar el catálogo interno del Agente IA con búsqueda + paginación de productos, toggle de disponibilidad (por fila y masivo), y carga masiva por XLSX (upsert por SKU + variantes).

**Architecture:** Capa de datos en `src/lib/agent/admin.ts` y `src/lib/agent/catalog/{variants,import}.ts` (funciones puras/testeables, scoped por orgId). UI server-side: la página `catalogo/page.tsx` lee `searchParams` (q, page) y carga solo la página visible; `_products.tsx` añade búsqueda/paginación/toggle/selección; sub-página `catalogo/importar` con wizard espejo del import de Contactos. Reusa SheetJS (`xlsx`, ya instalado).

**Tech Stack:** Next.js 16 (App Router, server components, server actions), Drizzle + better-sqlite3, SheetJS (`xlsx`), sonner, Vitest, Zod.

**Decisiones (spec 2026-06-22):** disponibilidad = toggle (no stock); XLSX = upsert por SKU + variantes; búsqueda/paginación server-side 20/pág; sin migración.

---

## Task 1: listProducts con búsqueda/paginación + countProducts

**Files:**
- Modify: `src/lib/agent/admin.ts`
- Test: `src/lib/agent/admin.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/agent/admin.test.ts` añade (revisa los imports/seed existentes del archivo y reúsalos; si seedea org, usa el mismo patrón):

```ts
import { countProducts } from "./admin";

describe("listProducts search/paginación", () => {
  it("filtra por nombre o sku y pagina", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    for (const [name, sku] of [["Camisa Azul", "CA1"], ["Camisa Roja", "CR1"], ["Pantalón", "PA1"]]) {
      await addProduct(db, "o1", { name, priceCop: 1000, sku });
    }
    const todos = await listProducts(db, "o1");
    expect(todos.length).toBe(3);
    const camisas = await listProducts(db, "o1", { search: "camisa" });
    expect(camisas.map((p) => p.name).sort()).toEqual(["Camisa Azul", "Camisa Roja"]);
    const porSku = await listProducts(db, "o1", { search: "pa1" });
    expect(porSku.map((p) => p.name)).toEqual(["Pantalón"]);
    const page1 = await listProducts(db, "o1", { limit: 2, offset: 0 });
    expect(page1.length).toBe(2);
    expect(await countProducts(db, "o1")).toBe(3);
    expect(await countProducts(db, "o1", { search: "camisa" })).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/admin.test.ts`
Expected: FAIL (`countProducts` no existe / `listProducts` no acepta opts).

- [ ] **Step 3: Implementar**

En `src/lib/agent/admin.ts`, asegura imports `import { and, asc, count, eq, like, or, sql } from "drizzle-orm";` y reemplaza `listProducts` + añade `countProducts`:

```ts
export type ListProductsOpts = { search?: string; limit?: number; offset?: number };

function productSearchCond(orgId: string, search?: string) {
  const conds = [eq(products.orgId, orgId)];
  const q = search?.trim().toLowerCase();
  if (q) {
    const like$ = `%${q}%`;
    conds.push(
      or(
        like(sql`lower(${products.name})`, like$),
        like(sql`lower(coalesce(${products.sku}, ''))`, like$),
      )!,
    );
  }
  return and(...conds);
}

export async function listProducts(db: DB, orgId: string, opts: ListProductsOpts = {}) {
  const base = db
    .select()
    .from(products)
    .where(productSearchCond(orgId, opts.search))
    .orderBy(asc(products.name));
  if (opts.limit != null) return base.limit(opts.limit).offset(opts.offset ?? 0);
  return base;
}

export async function countProducts(
  db: DB,
  orgId: string,
  opts: { search?: string } = {},
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(products)
    .where(productSearchCond(orgId, opts.search));
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/admin.test.ts`
Expected: PASS. Verifica también que `catalogo/page.tsx` (único caller) sigue compilando: `bunx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/admin.ts src/lib/agent/admin.test.ts
git commit -m "feat(catalog): listProducts search/pagination + countProducts"
```

---

## Task 2: setProductAvailable + setProductsAvailable

**Files:**
- Modify: `src/lib/agent/admin.ts`
- Test: `src/lib/agent/admin.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { setProductAvailable, setProductsAvailable } from "./admin";

describe("disponibilidad de productos", () => {
  it("toggle individual y masivo, scoped por org", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addProduct(db, "o1", { name: "A", priceCop: 1, sku: "A" });
    await addProduct(db, "o1", { name: "B", priceCop: 1, sku: "B" });
    const [a, b] = await listProducts(db, "o1");
    await setProductAvailable(db, "o1", a.id, false);
    expect((await listProducts(db, "o1")).find((p) => p.id === a.id)?.available).toBe(false);
    await setProductsAvailable(db, "o1", [a.id, b.id], true);
    expect((await listProducts(db, "o1")).every((p) => p.available)).toBe(true);
    // otra org no puede tocar
    await setProductAvailable(db, "o2", a.id, false);
    expect((await listProducts(db, "o1")).find((p) => p.id === a.id)?.available).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/admin.test.ts`
Expected: FAIL (funciones no existen).

- [ ] **Step 3: Implementar**

Añade `inArray` al import de drizzle (`import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";`) y en `admin.ts`:

```ts
export async function setProductAvailable(
  db: DB,
  orgId: string,
  id: string,
  available: boolean,
): Promise<void> {
  await db
    .update(products)
    .set({ available })
    .where(and(eq(products.id, id), eq(products.orgId, orgId)));
}

export async function setProductsAvailable(
  db: DB,
  orgId: string,
  ids: string[],
  available: boolean,
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(products)
    .set({ available })
    .where(and(eq(products.orgId, orgId), inArray(products.id, ids)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/admin.ts src/lib/agent/admin.test.ts
git commit -m "feat(catalog): setProductAvailable + bulk setProductsAvailable"
```

---

## Task 3: upsertProductBySku

**Files:**
- Modify: `src/lib/agent/admin.ts`
- Test: `src/lib/agent/admin.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { upsertProductBySku } from "./admin";

describe("upsertProductBySku", () => {
  it("crea si el sku no existe, actualiza si existe; sin sku crea siempre", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const a = await upsertProductBySku(db, "o1", { name: "Camisa", priceCop: 1000, sku: "C1" });
    expect(a.action).toBe("created");
    const b = await upsertProductBySku(db, "o1", { name: "Camisa XL", priceCop: 1500, sku: "C1" });
    expect(b.action).toBe("updated");
    expect(b.id).toBe(a.id);
    const list = await listProducts(db, "o1");
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Camisa XL");
    expect(list[0].priceCop).toBe(1500);
    const c = await upsertProductBySku(db, "o1", { name: "Sin SKU", priceCop: 1 });
    const d = await upsertProductBySku(db, "o1", { name: "Sin SKU 2", priceCop: 1 });
    expect(c.action).toBe("created");
    expect(d.action).toBe("created");
    expect((await listProducts(db, "o1")).length).toBe(3);
  });

  it("rechaza nombre vacío o precio inválido", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await expect(upsertProductBySku(db, "o1", { name: " ", priceCop: 1 })).rejects.toThrow(/nombre/i);
    await expect(upsertProductBySku(db, "o1", { name: "X", priceCop: -5 })).rejects.toThrow(/precio/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/admin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export async function upsertProductBySku(
  db: DB,
  orgId: string,
  input: { name: string; priceCop: number; sku?: string | null; description?: string | null; available?: boolean },
): Promise<{ id: string; action: "created" | "updated" }> {
  const name = input.name.trim();
  if (!name) throw new Error("Nombre requerido");
  if (!Number.isFinite(input.priceCop) || input.priceCop < 0) throw new Error("Precio inválido");
  const sku = (input.sku ?? "").trim() || null;
  const priceCop = Math.round(input.priceCop);

  if (sku) {
    const [existing] = await db
      .select()
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.sku, sku)));
    if (existing) {
      await db
        .update(products)
        .set({
          name,
          priceCop,
          description: input.description ?? existing.description,
          available: input.available ?? existing.available,
        })
        .where(eq(products.id, existing.id));
      return { id: existing.id, action: "updated" };
    }
  }

  const id = randomUUID();
  await db.insert(products).values({
    id,
    orgId,
    name,
    priceCop,
    description: input.description ?? null,
    sku,
    available: input.available ?? true,
    createdAt: new Date(),
  });
  return { id, action: "created" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/admin.ts src/lib/agent/admin.test.ts
git commit -m "feat(catalog): upsertProductBySku"
```

---

## Task 4: upsertVariant

**Files:**
- Modify: `src/lib/agent/catalog/variants.ts`
- Test: `src/lib/agent/catalog/variants.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/agent/catalog/variants.test.ts` (reusa su seed; necesita un producto). Añade:

```ts
import { upsertVariant, listVariants } from "./variants";

describe("upsertVariant", () => {
  it("crea por etiqueta y actualiza si existe", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const { id: productId } = await upsertProductBySku(db, "o1", { name: "Camisa", priceCop: 1000, sku: "C1" });
    const a = await upsertVariant(db, "o1", productId, { label: "Talla L", priceCop: 1200, sku: "C1-L" });
    expect(a.action).toBe("created");
    const b = await upsertVariant(db, "o1", productId, { label: "Talla L", priceCop: 1300 });
    expect(b.action).toBe("updated");
    expect(b.id).toBe(a.id);
    const vs = await listVariants(db, productId);
    expect(vs.length).toBe(1);
    expect(vs[0].priceCop).toBe(1300);
    expect(vs[0].sku).toBe("C1-L");
  });
});
```
(importa `upsertProductBySku` desde `@/lib/agent/admin` y `organization` desde `@/lib/db/schema`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/catalog/variants.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `variants.ts` (asegura imports `and, eq` de drizzle, `randomUUID` de node:crypto, `productVariants` del schema):

```ts
export async function upsertVariant(
  db: DB,
  orgId: string,
  productId: string,
  input: { label: string; priceCop?: number | null; sku?: string | null; available?: boolean },
): Promise<{ id: string; action: "created" | "updated" }> {
  const label = input.label.trim();
  if (!label) throw new Error("Etiqueta requerida");
  const [existing] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.orgId, orgId),
        eq(productVariants.productId, productId),
        eq(productVariants.label, label),
      ),
    );
  if (existing) {
    await db
      .update(productVariants)
      .set({
        priceCop: input.priceCop ?? existing.priceCop,
        sku: input.sku ?? existing.sku,
        available: input.available ?? existing.available,
      })
      .where(eq(productVariants.id, existing.id));
    return { id: existing.id, action: "updated" };
  }
  const id = randomUUID();
  await db.insert(productVariants).values({
    id,
    productId,
    orgId,
    label,
    priceCop: input.priceCop ?? null,
    sku: input.sku ?? null,
    available: input.available ?? true,
    sortOrder: 0,
    createdAt: new Date(),
  });
  return { id, action: "created" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/catalog/variants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/catalog/variants.ts src/lib/agent/catalog/variants.test.ts
git commit -m "feat(catalog): upsertVariant by label"
```

---

## Task 5: parseProductsFile + validateProductRows

**Files:**
- Create: `src/lib/agent/catalog/import.ts`
- Test: `src/lib/agent/catalog/import.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/catalog/import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateProductRows } from "./import";

describe("validateProductRows", () => {
  it("valida productos y variantes, reporta inválidas", () => {
    const rows = [
      { nombre: "Camisa", precio: "20000", sku: "C1", descripcion: "Algodón", disponible: "sí" },
      { nombre: "", precio: "", sku: "C1", variante: "Talla L", precio_variante: "22000", sku_variante: "C1-L", disponible_variante: "sí" },
      { nombre: "Pantalón", precio: "abc", sku: "P1" }, // precio inválido
      { nombre: "", precio: "", sku: "", variante: "Suelta" }, // variante sin sku
      { nombre: "", precio: "", sku: "" }, // vacía
    ];
    const res = validateProductRows(rows);
    expect(res.valid.length).toBe(2);
    expect(res.invalid.map((i) => i.row)).toEqual([4, 5, 6]); // filas 1-based + header
    const camisa = res.valid[0];
    expect(camisa.name).toBe("Camisa");
    expect(camisa.priceCop).toBe(20000);
    expect(camisa.available).toBe(true);
    const variante = res.valid[1];
    expect(variante.name).toBeNull();
    expect(variante.variant?.label).toBe("Talla L");
    expect(variante.variant?.priceCop).toBe(22000);
  });

  it("disponible vacío = true; 'no'/'agotado' = false", () => {
    const res = validateProductRows([
      { nombre: "A", precio: "1", sku: "A" },
      { nombre: "B", precio: "1", sku: "B", disponible: "no" },
      { nombre: "C", precio: "1", sku: "C", disponible: "agotado" },
    ]);
    expect(res.valid.map((v) => v.available)).toEqual([true, false, false]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/catalog/import.test.ts`
Expected: FAIL ("Cannot find module './import'").

- [ ] **Step 3: Implementar parse + validate**

Create `src/lib/agent/catalog/import.ts`:

```ts
import * as XLSX from "xlsx";

export type ProductRawRow = Record<string, string>;

export async function parseProductsFile(
  file: File,
): Promise<{ headers: string[]; rows: ProductRawRow[] }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ProductRawRow>(ws, { raw: false, defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export type ImportVariant = {
  label: string;
  priceCop: number | null;
  sku: string | null;
  available: boolean;
};

export type ValidProductRow = {
  sku: string | null;
  name: string | null;
  priceCop: number | null;
  description: string | null;
  available: boolean;
  variant: ImportVariant | null;
};

export type ProductValidation = {
  valid: ValidProductRow[];
  invalid: { row: number; error: string }[];
  productCount: number;
  variantCount: number;
};

function lowerKeys(r: ProductRawRow): ProductRawRow {
  const out: ProductRawRow = {};
  for (const k of Object.keys(r)) out[k.trim().toLowerCase()] = r[k];
  return out;
}

function parseBool(v: string | undefined, dflt = true): boolean {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "") return dflt;
  return !["no", "false", "0", "agotado", "n"].includes(s);
}

function parsePrice(v: string | undefined): number | null {
  const cleaned = (v ?? "").replace(/[^0-9.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function validateProductRows(rows: ProductRawRow[]): ProductValidation {
  const valid: ValidProductRow[] = [];
  const invalid: { row: number; error: string }[] = [];
  let productCount = 0;
  let variantCount = 0;

  rows.forEach((raw, i) => {
    const rowNum = i + 2; // fila 1 = encabezados
    const r = lowerKeys(raw);
    const name = (r["nombre"] ?? "").trim();
    const sku = (r["sku"] ?? "").trim() || null;
    const variantLabel = (r["variante"] ?? "").trim();

    if (!name && !variantLabel) {
      invalid.push({ row: rowNum, error: "fila vacía (sin nombre ni variante)" });
      return;
    }
    if (variantLabel && !sku) {
      invalid.push({ row: rowNum, error: "la variante necesita el sku del producto" });
      return;
    }

    let priceCop: number | null = null;
    if (name) {
      priceCop = parsePrice(r["precio"]);
      if (priceCop === null || priceCop < 0) {
        invalid.push({ row: rowNum, error: "precio inválido" });
        return;
      }
      productCount++;
    }

    const variant: ImportVariant | null = variantLabel
      ? {
          label: variantLabel,
          priceCop: parsePrice(r["precio_variante"]),
          sku: (r["sku_variante"] ?? "").trim() || null,
          available: parseBool(r["disponible_variante"]),
        }
      : null;
    if (variant) variantCount++;

    valid.push({
      sku,
      name: name || null,
      priceCop,
      description: (r["descripcion"] ?? "").trim() || null,
      available: parseBool(r["disponible"]),
      variant,
    });
  });

  return { valid, invalid, productCount, variantCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/catalog/import.test.ts`
Expected: PASS (2 tests). Nota: las filas inválidas esperadas son la 4 (precio "abc"), 5 (variante sin sku) y 6 (vacía) en 1-based+header.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/catalog/import.ts src/lib/agent/catalog/import.test.ts
git commit -m "feat(catalog): parseProductsFile + validateProductRows"
```

---

## Task 6: bulkImportProducts (upsert agrupado por SKU)

**Files:**
- Modify: `src/lib/agent/catalog/import.ts`
- Test: `src/lib/agent/catalog/import.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { listProducts } from "@/lib/agent/admin";
import { listVariants } from "./variants";
import { bulkImportProducts, validateProductRows } from "./import";

describe("bulkImportProducts", () => {
  it("upsert de productos y variantes agrupados por sku", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const { valid } = validateProductRows([
      { nombre: "Camisa", precio: "20000", sku: "C1" },
      { nombre: "", precio: "", sku: "C1", variante: "Talla L", precio_variante: "22000" },
      { nombre: "Pantalón", precio: "30000", sku: "P1" },
    ]);
    const r1 = await bulkImportProducts(db, "o1", valid);
    expect(r1.productsCreated).toBe(2);
    expect(r1.variantsCreated).toBe(1);
    expect((await listProducts(db, "o1")).length).toBe(2);

    // re-import actualiza (mismo sku) en vez de duplicar
    const { valid: valid2 } = validateProductRows([
      { nombre: "Camisa Premium", precio: "25000", sku: "C1" },
    ]);
    const r2 = await bulkImportProducts(db, "o1", valid2);
    expect(r2.productsUpdated).toBe(1);
    const list = await listProducts(db, "o1");
    expect(list.length).toBe(2);
    expect(list.find((p) => p.sku === "C1")?.name).toBe("Camisa Premium");
    const camisa = list.find((p) => p.sku === "C1")!;
    expect((await listVariants(db, camisa.id)).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/catalog/import.test.ts`
Expected: FAIL (`bulkImportProducts` no existe).

- [ ] **Step 3: Implementar**

En `src/lib/agent/catalog/import.ts` añade los imports y la función:

```ts
import type { DB } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { upsertProductBySku } from "@/lib/agent/admin";
import { upsertVariant } from "./variants";

export type ImportSummary = {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
};

export async function bulkImportProducts(
  db: DB,
  orgId: string,
  valid: ValidProductRow[],
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    productsCreated: 0,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
  };

  // Agrupar por sku (las filas con sku null se tratan individualmente como producto suelto).
  const groups = new Map<string, ValidProductRow[]>();
  const looseRows: ValidProductRow[] = [];
  for (const row of valid) {
    if (row.sku) {
      const g = groups.get(row.sku) ?? [];
      g.push(row);
      groups.set(row.sku, g);
    } else if (row.name) {
      looseRows.push(row);
    }
  }

  async function resolveProductId(
    sku: string,
    rowsForSku: ValidProductRow[],
  ): Promise<string | null> {
    const productRow = rowsForSku.find((r) => r.name && r.priceCop != null);
    if (productRow) {
      const res = await upsertProductBySku(db, orgId, {
        name: productRow.name as string,
        priceCop: productRow.priceCop as number,
        sku,
        description: productRow.description,
        available: productRow.available,
      });
      if (res.action === "created") summary.productsCreated++;
      else summary.productsUpdated++;
      return res.id;
    }
    // No hay fila que defina el producto: usar el existente si ya está en BD.
    const [existing] = await db
      .select()
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.sku, sku)));
    return existing?.id ?? null;
  }

  for (const [sku, rowsForSku] of groups) {
    const productId = await resolveProductId(sku, rowsForSku);
    if (!productId) continue; // grupo de solo-variantes para un producto inexistente: se omite
    for (const row of rowsForSku) {
      if (!row.variant) continue;
      const res = await upsertVariant(db, orgId, productId, row.variant);
      if (res.action === "created") summary.variantsCreated++;
      else summary.variantsUpdated++;
    }
  }

  // Productos sin sku: siempre se crean.
  for (const row of looseRows) {
    const res = await upsertProductBySku(db, orgId, {
      name: row.name as string,
      priceCop: row.priceCop as number,
      sku: null,
      description: row.description,
      available: row.available,
    });
    summary.productsCreated++;
    if (row.variant) {
      const v = await upsertVariant(db, orgId, res.id, row.variant);
      if (v.action === "created") summary.variantsCreated++;
      else summary.variantsUpdated++;
    }
  }

  return summary;
}
```

> Nota: no se envuelve en `db.transaction` para mantener compatibilidad con el driver async de Drizzle usado en los tests; los upserts son idempotentes por sku/label, así que un reintento es seguro.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/catalog/import.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/catalog/import.ts src/lib/agent/catalog/import.test.ts
git commit -m "feat(catalog): bulkImportProducts (sku-grouped upsert)"
```

---

## Task 7: buildProductsTemplate (plantilla descargable)

**Files:**
- Modify: `src/lib/agent/catalog/import.ts`
- Test: `src/lib/agent/catalog/import.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import * as XLSX from "xlsx";
import { buildProductsTemplate } from "./import";

describe("buildProductsTemplate", () => {
  it("genera un XLSX con los encabezados esperados", () => {
    const buf = buildProductsTemplate();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false, defval: "" });
    expect(Object.keys(rows[0])).toEqual([
      "nombre", "precio", "sku", "descripcion", "disponible",
      "variante", "precio_variante", "sku_variante", "disponible_variante",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/catalog/import.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export function buildProductsTemplate(): ArrayBuffer {
  const sample = [
    {
      nombre: "Camisa Clásica",
      precio: "59900",
      sku: "CAM-001",
      descripcion: "Algodón 100%",
      disponible: "sí",
      variante: "Talla M",
      precio_variante: "59900",
      sku_variante: "CAM-001-M",
      disponible_variante: "sí",
    },
    {
      nombre: "",
      precio: "",
      sku: "CAM-001",
      descripcion: "",
      disponible: "",
      variante: "Talla L",
      precio_variante: "62900",
      sku_variante: "CAM-001-L",
      disponible_variante: "sí",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sample, {
    header: [
      "nombre", "precio", "sku", "descripcion", "disponible",
      "variante", "precio_variante", "sku_variante", "disponible_variante",
    ],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/catalog/import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/catalog/import.ts src/lib/agent/catalog/import.test.ts
git commit -m "feat(catalog): buildProductsTemplate XLSX"
```

---

## Task 8: Server actions (toggle + bulk + import)

**Files:**
- Modify: `src/app/(app)/configuracion/agente/actions.ts`

- [ ] **Step 1: Implementar las acciones**

Añade imports y acciones en `src/app/(app)/configuracion/agente/actions.ts`:

```ts
import { setProductAvailable, setProductsAvailable } from "@/lib/agent/admin";
import { bulkImportProducts, type ValidProductRow } from "@/lib/agent/catalog/import";
```

```ts
export async function setProductAvailableAction(
  id: string,
  available: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setProductAvailable(db, orgId, id, available);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente/catalogo");
  return { ok: true };
}

export async function setProductsAvailableAction(
  ids: string[],
  available: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setProductsAvailable(db, orgId, ids, available);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente/catalogo");
  return { ok: true };
}

export async function importProductsAction(
  rows: ValidProductRow[],
): Promise<{ ok: true; summary: Awaited<ReturnType<typeof bulkImportProducts>> } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    const summary = await bulkImportProducts(db, orgId, rows);
    revalidatePath("/configuracion/agente/catalogo");
    return { ok: true, summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}
```

- [ ] **Step 2: Verificar**

Run: `bunx tsc --noEmit`
Expected: sin errores. (`requireOrg`, `db`, `revalidatePath` ya están importados en el archivo.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/configuracion/agente/actions.ts"
git commit -m "feat(catalog): server actions (availability + import)"
```

---

## Task 9: UI lista — búsqueda, paginación, toggle, selección múltiple

**Files:**
- Modify: `src/app/(app)/configuracion/agente/catalogo/page.tsx`
- Modify: `src/app/(app)/configuracion/agente/_products.tsx`

- [ ] **Step 1: page.tsx lee searchParams y pagina**

Reescribe `catalogo/page.tsx` para aceptar `searchParams` (Next 16: es `Promise`), pasar search/paginación a `listProducts`, y cargar variantes+imágenes solo de la página:

```tsx
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getCatalogConfig } from "@/lib/agent/integrations/catalog/config";
import { listProducts, countProducts } from "@/lib/agent/admin";
import { listVariants } from "@/lib/agent/catalog/variants";
import { listImages, imageUrl } from "@/lib/agent/catalog/images";
import { AgentCatalog } from "../_catalog";
import { AgentProducts } from "../_products";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { orgId } = await requireOrg();
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const catalogConfig = await getCatalogConfig(db, orgId);
  const isInternal = catalogConfig?.provider === "internal" || !catalogConfig;

  const total = isInternal ? await countProducts(db, orgId, { search }) : 0;
  const baseProductList = isInternal
    ? await listProducts(db, orgId, { search, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
    : [];

  const productList = await Promise.all(
    baseProductList.map(async (product) => {
      const variants = await listVariants(db, product.id);
      const imageRows = await listImages(db, product.id);
      return {
        ...product,
        variants: variants.map((v) => ({
          id: v.id, label: v.label, priceCop: v.priceCop, sku: v.sku, available: v.available,
        })),
        images: imageRows.map((r) => ({
          id: r.id, url: imageUrl(r), label: r.label, variantId: r.variantId,
        })),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <AgentCatalog provider={catalogConfig?.provider ?? "internal"} config={catalogConfig?.config ?? {}} />
      {isInternal && (
        <AgentProducts
          items={productList}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          search={search}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: _products.tsx — props nuevas + búsqueda/paginación/toggle/selección**

Modifica `AgentProducts` para aceptar `{ items, total, page, pageSize, search }` y añade:
- imports: `useRouter`, `usePathname` de `next/navigation`; `Link` de `next/link`; iconos `SearchIcon, ToggleLeftIcon, ToggleRightIcon, UploadIcon` de `lucide-react`; `setProductAvailableAction, setProductsAvailableAction` de `./actions`.
- Estado: `const [selected, setSelected] = useState<Set<string>>(new Set());`
- Una barra superior con: input de búsqueda (valor inicial `search`, al hacer Enter o con debounce hace `router.push(\`?q=\${encodeURIComponent(v)}&page=1\`)`), botón "Importar XLSX" (`<Link href="/configuracion/agente/catalogo/importar">`), y —si hay seleccionados— botones "Marcar disponibles/agotados" que llaman `setProductsAvailableAction([...selected], true|false)` + `router.refresh()`.
- En cada fila: un checkbox que agrega/quita de `selected`, y un botón toggle disponible/agotado (`setProductAvailableAction(product.id, !product.available)` + `router.refresh()` + toast), con icono `ToggleRightIcon` (emerald) si `available` else `ToggleLeftIcon`.
- Debajo de la lista: paginación "Mostrando {(page-1)*pageSize+1}–{min(page*pageSize,total)} de {total}" + enlaces Prev/Next que ajustan `?page=` preservando `?q=` (deshabilitados en extremos).

Código completo del componente (reemplaza la firma y el cuerpo; conserva el form de "Agregar producto" y el render de filas existentes, intercalando lo nuevo):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Trash2Icon, ChevronDownIcon, SearchIcon, UploadIcon,
  ToggleLeftIcon, ToggleRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addProductAction, deleteProductAction,
  setProductAvailableAction, setProductsAvailableAction,
} from "./actions";
import { ProductDetail } from "./_product-detail";
import type { products as productsSchema } from "@/lib/db/schema";

type Product = typeof productsSchema.$inferSelect;
type ProductWithDetails = Product & {
  variants: Array<{ id: string; label: string; priceCop: number | null; sku: string | null; available: boolean }>;
  images: Array<{ id: string; url: string; label: string | null; variantId: string | null }>;
};

export function AgentProducts({
  items, total, page, pageSize, search,
}: {
  items: ProductWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", priceCop: 0, description: "", sku: "" });
  const [query, setQuery] = useState(search);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goSearch() {
    router.push(`/configuracion/agente/catalogo?q=${encodeURIComponent(query.trim())}&page=1`);
  }
  function goPage(p: number) {
    router.push(`/configuracion/agente/catalogo?q=${encodeURIComponent(search)}&page=${p}`);
  }
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function bulkAvailable(available: boolean) {
    startTransition(async () => {
      const res = await setProductsAvailableAction([...selected], available);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(available ? "Marcados disponibles" : "Marcados agotados");
      setSelected(new Set());
      router.refresh();
    });
  }
  function toggleOne(id: string, current: boolean) {
    startTransition(async () => {
      const res = await setProductAvailableAction(id, !current);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    if (form.priceCop < 0) { toast.error("El precio debe ser mayor o igual a 0"); return; }
    startTransition(async () => {
      const result = await addProductAction({
        name: form.name, priceCop: form.priceCop,
        description: form.description || undefined, sku: form.sku || undefined,
      });
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Producto agregado");
      setForm({ name: "", priceCop: 0, description: "", sku: "" });
      router.refresh();
    });
  };
  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteProductAction(id);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Producto eliminado");
      setDeleteId(null);
      router.refresh();
    });
  };

  const priceFmt = (cop: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Productos</CardTitle>
        <CardDescription className="text-xs">
          Catálogo interno. Busca, marca disponibilidad o carga masiva por Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") goSearch(); }}
              placeholder="Buscar por nombre o SKU…"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={goSearch}>Buscar</Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/configuracion/agente/catalogo/importar">
              <UploadIcon className="size-4 mr-1.5" /> Importar XLSX
            </Link>
          </Button>
        </div>

        {/* Barra de selección */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span>{selected.size} seleccionado(s)</span>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => bulkAvailable(true)}>Marcar disponibles</Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => bulkAvailable(false)}>Marcar agotados</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpiar</Button>
          </div>
        )}

        {/* Add form (conservar el existente) */}
        <form onSubmit={handleAdd} className="space-y-4 p-4 bg-muted/30 rounded-lg border border-muted">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prod-name">Nombre</Label>
              <Input id="prod-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="iPhone 15" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-price">Precio (COP)</Label>
              <Input id="prod-price" type="number" value={form.priceCop} onChange={(e) => setForm({ ...form, priceCop: Number(e.target.value) })} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-desc">Descripción</Label>
            <Input id="prod-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Breve descripción" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-sku">SKU</Label>
            <Input id="prod-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU único" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending}>Agregar producto</Button>
          </div>
        </form>

        {/* Lista */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "Sin resultados para tu búsqueda." : "No hay productos aún."}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((product) => {
              const variantCount = product.variants.length;
              const imageCount = product.images.length;
              return (
                <div key={product.id}>
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelected(product.id)}
                      className="size-4 shrink-0"
                      aria-label={`Seleccionar ${product.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium truncate">{product.name}</h4>
                        {!product.available && (
                          <span className="text-[10px] font-medium text-red-600 border border-red-300 rounded px-1.5 py-0.5">Agotado</span>
                        )}
                      </div>
                      {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                      <div className="flex gap-4 mt-1.5">
                        <span className="text-xs text-muted-foreground">{variantCount} variante{variantCount !== 1 ? "s" : ""}</span>
                        <span className="text-xs text-muted-foreground">{imageCount} imagen{imageCount !== 1 ? "es" : ""}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-foreground whitespace-nowrap">{priceFmt(product.priceCop)}</span>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={isPending}
                        title={product.available ? "Marcar agotado" : "Marcar disponible"}
                        onClick={() => toggleOne(product.id, product.available)}>
                        {product.available ? <ToggleRightIcon className="size-4 text-emerald-600" /> : <ToggleLeftIcon className="size-4 text-muted-foreground" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2" disabled={isPending} onClick={() => setDetailOpen(product.id)}>
                        <ChevronDownIcon className="size-4" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={isPending}
                        onClick={() => { if (deleteId === product.id) handleDelete(product.id); else setDeleteId(product.id); }}>
                        {deleteId === product.id ? <span className="text-xs">¿Seguro?</span> : <Trash2Icon className="size-4" />}
                      </Button>
                    </div>
                  </div>
                  {detailOpen === product.id && (
                    <ProductDetail
                      product={product} variants={product.variants} images={product.images}
                      open={detailOpen === product.id}
                      onOpenChange={(open) => setDetailOpen(open ? product.id : null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        {total > pageSize && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <span>Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => goPage(page - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

> Verifica que `Button asChild` exista en el proyecto (la base UI lo soporta vía Radix Slot — `_payments`/otros lo usan). Si no, usa `onClick={() => router.push("/configuracion/agente/catalogo/importar")}` en lugar de `asChild`+`Link`.

- [ ] **Step 3: Verificar**

Run: `bunx tsc --noEmit` y `bun run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/configuracion/agente/catalogo/page.tsx" "src/app/(app)/configuracion/agente/_products.tsx"
git commit -m "feat(catalog): búsqueda + paginación + toggle + selección múltiple"
```

---

## Task 10: Sub-página de importación XLSX (wizard)

**Files:**
- Create: `src/app/(app)/configuracion/agente/catalogo/importar/page.tsx`
- Create: `src/app/(app)/configuracion/agente/catalogo/importar/_import.tsx`

- [ ] **Step 1: page.tsx (server, gate + render del cliente)**

Create `src/app/(app)/configuracion/agente/catalogo/importar/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { ImportProducts } from "./_import";

export const dynamic = "force-dynamic";

export default function ImportarProductosPage() {
  return (
    <div className="space-y-4">
      <Link href="/configuracion/agente/catalogo" className="text-xs text-muted-foreground hover:underline">
        <ArrowLeftIcon className="inline size-3" /> Catálogo
      </Link>
      <h2 className="text-lg font-semibold">Importar productos (XLSX)</h2>
      <ImportProducts />
    </div>
  );
}
```
(El `requireModuleAccess("agente")` ya lo aplica el `layout.tsx` del agente.)

- [ ] **Step 2: _import.tsx (wizard cliente)**

Create `src/app/(app)/configuracion/agente/catalogo/importar/_import.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  parseProductsFile, validateProductRows, buildProductsTemplate,
  type ProductValidation,
} from "@/lib/agent/catalog/import";
import { importProductsAction } from "../../actions";

export function ImportProducts() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState("");
  const [validation, setValidation] = useState<ProductValidation | null>(null);

  function downloadTemplate() {
    const buf = buildProductsTemplate();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-productos.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows } = await parseProductsFile(file);
      setFileName(file.name);
      setValidation(validateProductRows(rows));
    } catch {
      toast.error("No pude leer el archivo");
    }
    e.target.value = "";
  }

  function confirmImport() {
    if (!validation) return;
    startTransition(async () => {
      const res = await importProductsAction(validation.valid);
      if ("error" in res) { toast.error(res.error); return; }
      const s = res.summary;
      toast.success(`Importado: ${s.productsCreated + s.productsUpdated} productos, ${s.variantsCreated + s.variantsUpdated} variantes`);
      router.push("/configuracion/agente/catalogo");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1 · Plantilla y archivo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <DownloadIcon className="size-4 mr-1.5" /> Descargar plantilla
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
            <span className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted">
              <UploadIcon className="size-4" /> Subir XLSX
            </span>
          </label>
        </div>

        {validation && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">{fileName}</p>
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-600">{validation.productCount} productos</span>
              <span className="text-blue-600">{validation.variantCount} variantes</span>
              <span className="text-red-600">{validation.invalid.length} inválidas</span>
            </div>
            {validation.invalid.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-xs space-y-1 max-h-40 overflow-auto">
                {validation.invalid.slice(0, 10).map((inv) => (
                  <div key={inv.row}>Fila {inv.row}: {inv.error}</div>
                ))}
                {validation.invalid.length > 10 && <div>… y {validation.invalid.length - 10} más</div>}
              </div>
            )}
            <Button onClick={confirmImport} disabled={isPending || validation.valid.length === 0} size="sm">
              {isPending ? "Importando…" : `Importar ${validation.productCount} productos`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `bunx tsc --noEmit` y `bun run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/configuracion/agente/catalogo/importar"
git commit -m "feat(catalog): XLSX import wizard sub-page + template download"
```

---

## Task 11: Gauntlet + review + merge + deploy

- [ ] **Step 1:** `bunx vitest run` → todo verde.
- [ ] **Step 2:** `bunx tsc --noEmit` (si falla por `.next/types/* 2.ts`, correr `find .next/types -name "* 2.ts" -delete` y reintentar) → limpio.
- [ ] **Step 3:** `bun run lint` → sin errores.
- [ ] **Step 4:** `bun run build` → OK.
- [ ] **Step 5:** Smoke manual: en Catálogo, buscar un producto, paginar, marcar agotado (individual + masivo), descargar plantilla, subir un XLSX de prueba (productos + variantes), confirmar el resumen, ver los productos creados/actualizados.
- [ ] **Step 6:** `code-reviewer` sobre el diff.
- [ ] **Step 7:** Merge a main + `deploy/deploy.sh` (sin migración nueva).
- [ ] **Step 8:** Actualizar memoria del proyecto.

---

## Self-Review (cobertura del spec)
- ✅ Búsqueda + paginación → Task 1 (capa) + Task 9 (UI).
- ✅ Disponibilidad toggle + masivo → Task 2 (capa) + Task 8 (acciones) + Task 9 (UI).
- ✅ Upsert por SKU (producto) → Task 3; (variante por etiqueta) → Task 4.
- ✅ Parse + validación XLSX → Task 5; bulk upsert agrupado → Task 6; plantilla → Task 7.
- ✅ Wizard de importación → Task 10.
- ✅ Sin migración (campos existentes) — confirmado en Tasks 1–7.
- ✅ Compatibilidad `listProducts` (opts opcional; único caller catalogo/page.tsx) → Task 1 mantiene el default.
- ✅ Multi-tenant: todas las fns scoped por orgId, con tests de aislamiento (Task 2).

**Consistencia de tipos:** `listProducts(db, orgId, opts?)`, `countProducts(db, orgId, {search}?)`, `setProductAvailable`/`setProductsAvailable`, `upsertProductBySku(...)→{id,action}`, `upsertVariant(...)→{id,action}`, `ValidProductRow`/`ProductValidation`/`ImportSummary`, `bulkImportProducts(db,orgId,ValidProductRow[])→ImportSummary` — usados igual en capa, acciones y UI.
