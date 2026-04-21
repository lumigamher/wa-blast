import { NextResponse } from "next/server";
import { db, type BatchItemRow, type BatchRow } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const batch = db
    .prepare("SELECT * FROM batches WHERE id = ?")
    .get(id) as BatchRow | undefined;
  if (!batch) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const items = db
    .prepare("SELECT * FROM batch_items WHERE batch_id = ? ORDER BY id")
    .all(id) as BatchItemRow[];

  return NextResponse.json(
    { batch, items },
    { headers: { "Cache-Control": "no-store" } },
  );
}
