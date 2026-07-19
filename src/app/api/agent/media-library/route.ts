import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { checkModuleGate } from "@/lib/billing/access";
import { db } from "@/lib/db/client";
import { saveMediaAsset } from "@/lib/media/store";
import { mimeToKind, addMedia, deleteMedia } from "@/lib/agent/media-library";

const MAX_BYTES = 16 * 1024 * 1024; // 16MB

export async function POST(req: Request): Promise<NextResponse> {
  const { orgId } = await requireOrg();
  if (!(await checkModuleGate(db, orgId, "agente"))) {
    return NextResponse.json({ error: "Tu plan no incluye el agente IA." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Archivo muy grande (máx 16MB)" },
      { status: 413 },
    );
  }

  const label = (form.get("label") as string | null) ?? null;
  const productId = (form.get("productId") as string | null) ?? null;

  const bytes = await file.arrayBuffer();
  const kind = mimeToKind(file.type || "application/octet-stream");

  const asset = await saveMediaAsset(db, {
    orgId,
    bytes,
    mime: file.type || "application/octet-stream",
    kind,
  });

  const mediaId = await addMedia(db, orgId, {
    kind,
    mediaAssetId: asset.id,
    label: label || file.name,
    productId: productId || null,
  });

  return NextResponse.json({ ok: true, id: mediaId });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const { orgId } = await requireOrg();
  if (!(await checkModuleGate(db, orgId, "agente"))) {
    return NextResponse.json({ error: "Tu plan no incluye el agente IA." }, { status: 403 });
  }

  let body: { id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  await deleteMedia(db, orgId, id);
  return NextResponse.json({ ok: true });
}
