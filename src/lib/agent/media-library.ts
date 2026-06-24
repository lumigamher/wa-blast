import { randomUUID } from "node:crypto";
import { and, eq, like, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentMediaLibrary } from "@/lib/db/schema";

export type MediaKind = "image" | "video" | "document";
export type MediaItem = {
  id: string;
  kind: MediaKind;
  mediaAssetId: string;
  label: string;
  productId: string | null;
};

export function mimeToKind(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export async function addMedia(
  db: DB,
  orgId: string,
  input: {
    kind: MediaKind;
    mediaAssetId: string;
    label: string;
    productId?: string | null;
  },
): Promise<string> {
  const label = input.label.trim();
  if (!label) throw new Error("Etiqueta requerida");

  const id = randomUUID();
  await db.insert(agentMediaLibrary).values({
    id,
    orgId,
    kind: input.kind,
    mediaAssetId: input.mediaAssetId,
    label,
    productId: input.productId ?? null,
    createdAt: new Date(),
  });

  return id;
}

export async function listMedia(
  db: DB,
  orgId: string,
  opts?: { productId?: string },
): Promise<MediaItem[]> {
  const conds = [eq(agentMediaLibrary.orgId, orgId)];
  if (opts?.productId) {
    conds.push(eq(agentMediaLibrary.productId, opts.productId));
  }

  return db
    .select({
      id: agentMediaLibrary.id,
      kind: agentMediaLibrary.kind,
      mediaAssetId: agentMediaLibrary.mediaAssetId,
      label: agentMediaLibrary.label,
      productId: agentMediaLibrary.productId,
    })
    .from(agentMediaLibrary)
    .where(and(...conds))
    .orderBy(agentMediaLibrary.label);
}

export async function findMedia(
  db: DB,
  orgId: string,
  query: string,
): Promise<MediaItem | null> {
  const q = `%${query.trim().toLowerCase()}%`;
  const rows = await db
    .select({
      id: agentMediaLibrary.id,
      kind: agentMediaLibrary.kind,
      mediaAssetId: agentMediaLibrary.mediaAssetId,
      label: agentMediaLibrary.label,
      productId: agentMediaLibrary.productId,
    })
    .from(agentMediaLibrary)
    .where(
      and(
        eq(agentMediaLibrary.orgId, orgId),
        like(sql`lower(${agentMediaLibrary.label})`, q),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function deleteMedia(
  db: DB,
  orgId: string,
  id: string,
): Promise<void> {
  await db
    .delete(agentMediaLibrary)
    .where(
      and(
        eq(agentMediaLibrary.id, id),
        eq(agentMediaLibrary.orgId, orgId),
      ),
    );
}
