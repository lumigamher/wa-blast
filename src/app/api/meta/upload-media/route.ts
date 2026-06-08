import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { MEDIA_LIMITS, MetaApiError, credsFromSettings, uploadMedia } from "@/lib/meta/graph";
import type { MediaFormat } from "@/lib/meta/types";
import { saveMediaAsset, publicMediaUrl } from "@/lib/media/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatFor(mimeType: string): MediaFormat | null {
  if (MEDIA_LIMITS.IMAGE.mimes.includes(mimeType)) return "IMAGE";
  if (MEDIA_LIMITS.VIDEO.mimes.includes(mimeType)) return "VIDEO";
  if (MEDIA_LIMITS.DOCUMENT.mimes.includes(mimeType)) return "DOCUMENT";
  return null;
}

export async function POST(req: Request) {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) {
    return NextResponse.json({ ok: false, error: "Meta creds no configuradas" }, { status: 400 });
  }
  if (!creds.appId) {
    return NextResponse.json(
      { ok: false, error: "META_APP_ID no configurado (necesario para uploads)" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Falta archivo" }, { status: 400 });
  }

  const format = formatFor(file.type);
  if (!format) {
    return NextResponse.json(
      { ok: false, error: `MIME type no soportado: ${file.type}` },
      { status: 400 },
    );
  }

  const limit = MEDIA_LIMITS[format];
  if (file.size > limit.maxBytes) {
    return NextResponse.json(
      { ok: false, error: `Archivo demasiado grande (${Math.round(file.size / 1024 / 1024)}MB, límite ${Math.round(limit.maxBytes / 1024 / 1024)}MB)` },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const handle = await uploadMedia(creds, bytes, { fileName: file.name, mimeType: file.type });
    const asset = await saveMediaAsset(db, { orgId, bytes, mime: file.type });
    return NextResponse.json({ ok: true, handle, format, assetId: asset.id, publicUrl: publicMediaUrl(asset.id) });
  } catch (e) {
    if (e instanceof MetaApiError) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
