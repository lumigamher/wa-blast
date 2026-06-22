import type { DB } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { upsertProductBySku } from "@/lib/agent/admin";
import { upsertVariant } from "./variants";
import type { ProductRawRow, ImportVariant, ValidProductRow, ProductValidation } from "./import-client";

// Re-export types for convenience
export type { ProductRawRow, ImportVariant, ValidProductRow, ProductValidation };

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

export async function buildProductsTemplate(): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
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
