import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { stickers } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";

export async function listStickers(db: DB, orgId: string) {
  return db
    .select()
    .from(stickers)
    .where(eq(stickers.orgId, orgId))
    .orderBy(desc(stickers.createdAt));
}

export async function addSticker(db: DB, orgId: string, input: { webp: Uint8Array; dir?: string }) {
  const bytes = input.webp.buffer.slice(
    input.webp.byteOffset,
    input.webp.byteOffset + input.webp.byteLength,
  );
  const asset = await saveMediaAsset(db, {
    orgId,
    bytes,
    mime: "image/webp",
    kind: "sticker",
    dir: input.dir,
  });
  const row = { id: randomUUID(), orgId, assetId: asset.id, createdAt: new Date() };
  await db.insert(stickers).values(row);
  return row;
}

export async function deleteSticker(db: DB, orgId: string, id: string) {
  await db.delete(stickers).where(and(eq(stickers.id, id), eq(stickers.orgId, orgId)));
}
