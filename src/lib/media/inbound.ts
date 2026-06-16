import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { inboxMediaCache } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";

async function download(url: string, token: string): Promise<ArrayBuffer | null> {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) {
    console.log("[MEDIA-DBG] download FAIL", r.status); // TEMPORAL: diagnóstico
    return null;
  }
  return r.arrayBuffer();
}

/**
 * Garantiza que un media de Meta esté descargado y cacheado localmente.
 * Devuelve el assetId o null si falla (best-effort).
 *
 * Meta ahora incluye el `url` del media directamente en el webhook; si se pasa
 * `directUrl` (fresco) se descarga directo, ahorrando el `GET /{mediaId}`. Si no
 * está o falla (p.ej. expiró), cae al endpoint clásico de metadata.
 */
export async function ensureInboundMedia(
  db: DB,
  p: {
    orgId: string;
    metaMediaId: string;
    accessToken: string | null | undefined;
    directUrl?: string | null;
    mime?: string | null;
  },
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
    let bytes: ArrayBuffer | null = null;
    let mime = p.mime ?? "application/octet-stream";

    // 1) Url directo del webhook (rápido, sin llamada a Graph)
    if (p.directUrl) {
      bytes = await download(p.directUrl, p.accessToken);
      if (bytes) console.log("[MEDIA-DBG] direct url OK", mime); // TEMPORAL
      else console.log("[MEDIA-DBG] direct url FAIL → fallback a metadata"); // TEMPORAL
    }

    // 2) Fallback: Graph GET /{mediaId} → { url, mime_type }
    if (!bytes) {
      const metaRes = await fetch(`https://graph.facebook.com/v22.0/${p.metaMediaId}`, {
        headers: { authorization: `Bearer ${p.accessToken}` },
      });
      if (!metaRes.ok) {
        console.log("[MEDIA-DBG] metadata FAIL", metaRes.status, (await metaRes.text().catch(() => "")).slice(0, 300)); // TEMPORAL
        return null;
      }
      const meta = (await metaRes.json()) as { url: string; mime_type: string };
      console.log("[MEDIA-DBG] metadata OK", JSON.stringify(meta).slice(0, 300)); // TEMPORAL
      bytes = await download(meta.url, p.accessToken);
      if (!bytes) return null;
      mime = meta.mime_type;
    }

    // Save to local storage
    const asset = await saveMediaAsset(db, { orgId: p.orgId, bytes, mime });

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
