import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { inboxMediaCache } from "@/lib/db/schema";
import { getMediaAsset, saveMediaAsset } from "@/lib/media/store";
import { getOrgSettings } from "@/lib/org/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const { orgId } = await requireOrg();

  const cached = (await db.select().from(inboxMediaCache).where(eq(inboxMediaCache.metaMediaId, mediaId)))[0];
  if (cached) {
    if (cached.orgId !== orgId) return new Response("Not found", { status: 404 });
    const asset = await getMediaAsset(db, cached.assetId);
    if (asset) {
      const buf = await readFile(asset.path);
      return new Response(buf, {
        headers: { "content-type": asset.mime, "cache-control": "private, max-age=86400" },
      });
    }
  }

  const settings = await getOrgSettings(db, orgId);
  if (!settings.metaAccessToken) return new Response("Meta no configurado", { status: 400 });

  const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { authorization: `Bearer ${settings.metaAccessToken}` },
  });
  if (!metaRes.ok) return new Response("Media no disponible", { status: 404 });

  const meta = (await metaRes.json()) as { url: string; mime_type: string };
  const fileRes = await fetch(meta.url, {
    headers: { authorization: `Bearer ${settings.metaAccessToken}` },
  });
  if (!fileRes.ok) return new Response("Descarga falló", { status: 502 });

  const bytes = await fileRes.arrayBuffer();
  const asset = await saveMediaAsset(db, { orgId, bytes, mime: meta.mime_type });

  await db
    .insert(inboxMediaCache)
    .values({ metaMediaId: mediaId, orgId, assetId: asset.id, createdAt: new Date() })
    .onConflictDoNothing();

  return new Response(bytes, {
    headers: { "content-type": meta.mime_type, "cache-control": "private, max-age=86400" },
  });
}
