import { readFile } from "node:fs/promises";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getMediaAsset } from "@/lib/media/store";
import { getOrgSettings } from "@/lib/org/settings";
import { ensureInboundMedia } from "@/lib/media/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const { orgId } = await requireOrg();

  // Asset local (media saliente persistido): id con prefijo "media_"
  if (mediaId.startsWith("media_")) {
    const asset = await getMediaAsset(db, mediaId);
    if (!asset || asset.orgId !== orgId) return new Response("Not found", { status: 404 });
    const buf = await readFile(asset.path);
    return new Response(buf, {
      headers: { "content-type": asset.mime, "cache-control": "private, max-age=86400" },
    });
  }

  // Get or cache inbound media from Meta
  const settings = await getOrgSettings(db, orgId);
  const assetId = await ensureInboundMedia(db, {
    orgId,
    metaMediaId: mediaId,
    accessToken: settings.metaAccessToken,
  });

  if (!assetId) {
    return new Response("Media no disponible", { status: 404 });
  }

  // Serve the cached asset
  const asset = await getMediaAsset(db, assetId);
  if (!asset) {
    return new Response("Media no disponible", { status: 404 });
  }

  const buf = await readFile(asset.path);
  return new Response(buf, {
    headers: { "content-type": asset.mime, "cache-control": "private, max-age=86400" },
  });
}
