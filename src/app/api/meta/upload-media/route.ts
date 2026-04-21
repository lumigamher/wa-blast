import { NextResponse } from "next/server";
import { metaApi, MEDIA_LIMITS, MetaApiError, type MediaFormat } from "@/lib/meta";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatFor(mimeType: string): MediaFormat | null {
  if (MEDIA_LIMITS.IMAGE.mime.includes(mimeType as never)) return "IMAGE";
  if (MEDIA_LIMITS.VIDEO.mime.includes(mimeType as never)) return "VIDEO";
  if (MEDIA_LIMITS.DOCUMENT.mime.includes(mimeType as never)) return "DOCUMENT";
  return null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Falta archivo" }, { status: 400 });
  }

  const format = formatFor(file.type);
  if (!format) {
    return NextResponse.json(
      {
        ok: false,
        error: `Tipo no soportado: ${file.type}. Usa JPG/PNG, MP4 o PDF.`,
      },
      { status: 400 },
    );
  }

  const limit = MEDIA_LIMITS[format].bytes;
  if (file.size > limit) {
    return NextResponse.json(
      {
        ok: false,
        error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máx ${(limit / 1024 / 1024).toFixed(0)}MB para ${format}.`,
      },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const handle = await metaApi.uploadMedia(bytes, {
      fileName: file.name,
      mimeType: file.type,
    });
    return NextResponse.json({
      ok: true,
      handle,
      format,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  } catch (e) {
    if (e instanceof MetaApiError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: e.code },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
