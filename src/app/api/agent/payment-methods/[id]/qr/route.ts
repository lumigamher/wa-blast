import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { paymentMethods } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";
import { setPaymentMethodQr } from "@/lib/agent/payments/methods";

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: methodId } = await params;
  const { orgId } = await requireOrg();

  // Validate that payment method belongs to org
  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, methodId), eq(paymentMethods.orgId, orgId)));
  if (!method) return NextResponse.json({ error: "Método de pago no encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Archivo muy grande (máx 2MB)" }, { status: 413 });

  const bytes = await file.arrayBuffer();
  const asset = await saveMediaAsset(db, {
    orgId,
    bytes,
    mime: file.type || "image/png",
    kind: "image",
  });
  await setPaymentMethodQr(db, orgId, methodId, asset.id);
  return NextResponse.json({ ok: true, id: asset.id });
}
