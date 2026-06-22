import * as XLSX from "xlsx";
import type { DB } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { upsertProductBySku } from "@/lib/agent/admin";
import { upsertVariant } from "./variants";

export type ProductRawRow = Record<string, string>;

export async function parseProductsFile(file: File): Promise<{ headers: string[]; rows: ProductRawRow[] }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ProductRawRow>(ws, { raw: false, defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export type ImportVariant = { label: string; priceCop: number | null; sku: string | null; available: boolean };
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
  for (const k of Object.keys(r)) {
    out[k.trim().toLowerCase()] = r[k];
  }
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
    const rowNum = i + 2;
    const r = lowerKeys(raw);

    const name = (r["nombre"] ?? "").trim();
    const sku = (r["sku"] ?? "").trim() || null;
    const variantLabel = (r["variante"] ?? "").trim();

    // Empty row (neither product nor variant)
    if (!name && !variantLabel) {
      invalid.push({ row: rowNum, error: "fila vacía (sin nombre ni variante)" });
      return;
    }

    // Variant without SKU
    if (variantLabel && !sku) {
      invalid.push({ row: rowNum, error: "la variante necesita el sku del producto" });
      return;
    }

    // Parse product price (required if row has product name)
    let priceCop: number | null = null;
    if (name) {
      priceCop = parsePrice(r["precio"]);
      if (priceCop === null || priceCop < 0) {
        invalid.push({ row: rowNum, error: "precio inválido" });
        return;
      }
      productCount++;
    }

    // Parse variant
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

export type ImportSummary = {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
};

export async function bulkImportProducts(db: DB, orgId: string, valid: ValidProductRow[]): Promise<ImportSummary> {
  const summary: ImportSummary = { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0 };

  // Group rows by SKU
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

  // Helper: resolve or create product by SKU
  async function resolveProductId(sku: string, rowsForSku: ValidProductRow[]): Promise<string | null> {
    // Find row with product data (name + price)
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

    // If no product data, look for existing product with this SKU
    const [existing] = await db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.sku, sku)));
    return existing?.id ?? null;
  }

  // Process grouped rows
  for (const [sku, rowsForSku] of groups) {
    const productId = await resolveProductId(sku, rowsForSku);
    if (!productId) continue;

    // Upsert variants for this product
    for (const row of rowsForSku) {
      if (!row.variant) continue;
      const res = await upsertVariant(db, orgId, productId, row.variant);
      if (res.action === "created") summary.variantsCreated++;
      else summary.variantsUpdated++;
    }
  }

  // Process loose rows (products without SKU)
  for (const row of looseRows) {
    const res = await upsertProductBySku(db, orgId, {
      name: row.name as string,
      priceCop: row.priceCop as number,
      sku: null,
      description: row.description,
      available: row.available,
    });
    summary.productsCreated++;

    // Add variant if present
    if (row.variant) {
      const v = await upsertVariant(db, orgId, res.id, row.variant);
      if (v.action === "created") summary.variantsCreated++;
      else summary.variantsUpdated++;
    }
  }

  return summary;
}

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
    header: ["nombre", "precio", "sku", "descripcion", "disponible", "variante", "precio_variante", "sku_variante", "disponible_variante"],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
