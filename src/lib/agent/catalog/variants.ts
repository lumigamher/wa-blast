import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { productVariants } from "@/lib/db/schema";

export async function listVariants(db: DB, productId: string) {
  return db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder));
}

export async function addVariant(db: DB, orgId: string, productId: string, input: { label: string; priceCop?: number | null; sku?: string | null }): Promise<void> {
  if (!input.label.trim()) throw new Error("Etiqueta requerida");
  await db.insert(productVariants).values({ id: randomUUID(), productId, orgId, label: input.label.trim(), priceCop: input.priceCop ?? null, sku: input.sku ?? null, available: true, sortOrder: 0, createdAt: new Date() });
}

export async function deleteVariant(db: DB, orgId: string, id: string): Promise<void> {
  await db.delete(productVariants).where(and(eq(productVariants.id, id), eq(productVariants.orgId, orgId)));
}

export async function setVariantAvailable(db: DB, orgId: string, id: string, available: boolean): Promise<void> {
  await db.update(productVariants).set({ available }).where(and(eq(productVariants.id, id), eq(productVariants.orgId, orgId)));
}
