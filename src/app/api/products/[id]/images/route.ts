import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";
import { addImageUpload } from "@/lib/agent/catalog/images";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: productId } = await params;
  const { orgId } = await requireOrg();

  // Validate that product belongs to org
  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)));
  if (!prod) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Archivo muy grande (máx 5MB)" }, { status: 413 });

  const label = (form.get("label") as string | null) ?? null;
  const variantId = (form.get("variantId") as string | null) ?? null;

  const bytes = await file.arrayBuffer();
  const asset = await saveMediaAsset(db, {
    orgId,
    bytes,
    mime: file.type || "image/jpeg",
    kind: "image",
  });
  await addImageUpload(db, orgId, productId, {
    mediaAssetId: asset.id,
    label,
    variantId: variantId || null,
  });
  return NextResponse.json({ ok: true, id: asset.id });
}
