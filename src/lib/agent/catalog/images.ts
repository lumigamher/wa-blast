import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { productImages } from "@/lib/db/schema";

export function imageUrl(row: { source: string; mediaAssetId: string | null; url: string | null }): string {
  if (row.source === "url" && row.url) return row.url;
  if (row.source === "upload" && row.mediaAssetId) return `/api/inbox/media/${row.mediaAssetId}`;
  return "";
}

export async function listImages(db: DB, orgId: string, productId: string) {
  return db.select().from(productImages).where(and(eq(productImages.orgId, orgId), eq(productImages.productId, productId))).orderBy(asc(productImages.sortOrder));
}

export async function addImageUrl(db: DB, orgId: string, productId: string, input: { url: string; label?: string | null; variantId?: string | null }): Promise<void> {
  if (!input.url.trim()) throw new Error("URL requerida");
  await db.insert(productImages).values({ id: randomUUID(), productId, orgId, variantId: input.variantId ?? null, source: "url", mediaAssetId: null, url: input.url.trim(), label: input.label ?? null, sortOrder: 0, createdAt: new Date() });
}

export async function addImageUpload(db: DB, orgId: string, productId: string, input: { mediaAssetId: string; label?: string | null; variantId?: string | null }): Promise<void> {
  await db.insert(productImages).values({ id: randomUUID(), productId, orgId, variantId: input.variantId ?? null, source: "upload", mediaAssetId: input.mediaAssetId, url: null, label: input.label ?? null, sortOrder: 0, createdAt: new Date() });
}

export async function deleteImage(db: DB, orgId: string, id: string): Promise<void> {
  await db.delete(productImages).where(and(eq(productImages.id, id), eq(productImages.orgId, orgId)));
}
