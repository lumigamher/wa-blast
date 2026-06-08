import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { mediaAssets } from "@/lib/db/schema";
import { env } from "@/lib/env";

export type SavedAsset = {
  id: string;
  kind: "image" | "video";
  mime: string;
  path: string;
  bytes: number;
};

export async function saveMediaAsset(
  db: DB,
  input: { orgId: string; bytes: ArrayBuffer; mime: string; dir?: string },
): Promise<SavedAsset> {
  const dir = input.dir ?? env.MEDIA_DIR;
  mkdirSync(dir, { recursive: true });
  const id = `media_${crypto.randomUUID()}`;
  const path = join(dir, id);
  writeFileSync(path, Buffer.from(input.bytes));
  const kind: "image" | "video" = input.mime.startsWith("video/") ? "video" : "image";
  const bytes = input.bytes.byteLength;
  await db.insert(mediaAssets).values({
    id,
    orgId: input.orgId,
    kind,
    mime: input.mime,
    path,
    bytes,
    createdAt: new Date(),
  });
  return { id, kind, mime: input.mime, path, bytes };
}

export async function getMediaAsset(db: DB, id: string) {
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  return row ?? null;
}

export function publicMediaUrl(id: string): string {
  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;
  return `${base.replace(/\/$/, "")}/media/${id}`;
}
