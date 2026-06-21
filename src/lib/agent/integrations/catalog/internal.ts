import { and, eq, like, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import type { CatalogProvider, Product } from "./types";

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

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        priceCop: row.priceCop,
        description: row.description ?? undefined,
        available: row.available,
      }));
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

      return {
        id: row.id,
        name: row.name,
        priceCop: row.priceCop,
        description: row.description ?? undefined,
        available: row.available,
      };
    },
  };
}
