import { and, eq, like, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { listVariants } from "@/lib/agent/catalog/variants";
import { listImages, imageUrl } from "@/lib/agent/catalog/images";
import type { CatalogProvider, Product, ProductVariant, ProductImage } from "./types";

async function enrichProduct(db: DB, orgId: string, row: { id: string; name: string; priceCop: number; description: string | null; available: boolean }): Promise<Product> {
  const vRows = await listVariants(db, orgId, row.id);
  const variants: ProductVariant[] = vRows.map((v) => ({
    id: v.id,
    label: v.label,
    priceCop: v.priceCop ?? row.priceCop,
    sku: v.sku,
    available: v.available,
  }));

  const iRows = await listImages(db, orgId, row.id);
  const images: ProductImage[] = iRows.map((r) => ({
    url: imageUrl(r),
    label: r.label,
    variantId: r.variantId,
  }));

  return {
    id: row.id,
    name: row.name,
    priceCop: row.priceCop,
    description: row.description ?? undefined,
    available: row.available,
    variants,
    images,
  };
}

export function makeInternalCatalog(db: DB, orgId: string): CatalogProvider {
  return {
    async search({ query, limit = 10 }): Promise<Product[]> {
      const rows = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.orgId, orgId),
            eq(products.available, true),
            like(sql`lower(${products.name})`, `%${query.toLowerCase()}%`)
          )
        )
        .limit(limit);

      return Promise.all(rows.map((row) => enrichProduct(db, orgId, row)));
    },

    async get(id: string): Promise<Product | null> {
      const row = await db
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.orgId, orgId)))
        .get();

      if (!row) {
        return null;
      }

      return enrichProduct(db, orgId, row);
    },
  };
}
