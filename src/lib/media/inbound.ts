import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { inboxMediaCache } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";

/**
 * Garantiza que un media de Meta esté descargado y cacheado localmente.
 * Devuelve el assetId o null si falla (best-effort).
 */
export async function ensureInboundMedia(
  db: DB,
  p: { orgId: string; metaMediaId: string; accessToken: string | null | undefined },
): Promise<string | null> {
  // Check if already cached for this org
  const cached = (await db.select().from(inboxMediaCache).where(eq(inboxMediaCache.metaMediaId, p.metaMediaId)))[0];
  if (cached && cached.orgId === p.orgId) {
    return cached.assetId;
  }

  // No access token = can't fetch
  if (!p.accessToken) {
    return null;
  }

  try {
    // Fetch metadata from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${p.metaMediaId}`, {
      headers: { authorization: `Bearer ${p.accessToken}` },
    });
    if (!metaRes.ok) {
      return null;
    }

    const meta = (await metaRes.json()) as { url: string; mime_type: string };

    // Download file
    const fileRes = await fetch(meta.url, {
      headers: { authorization: `Bearer ${p.accessToken}` },
    });
    if (!fileRes.ok) {
      return null;
    }

    const bytes = await fileRes.arrayBuffer();

    // Save to local storage
    const asset = await saveMediaAsset(db, { orgId: p.orgId, bytes, mime: meta.mime_type });

    // Cache the mapping
    await db
      .insert(inboxMediaCache)
      .values({
        metaMediaId: p.metaMediaId,
        orgId: p.orgId,
        assetId: asset.id,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    return asset.id;
  } catch {
    // Best-effort: log and return null
    return null;
  }
}
