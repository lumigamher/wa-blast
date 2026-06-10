import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { campaignRecipients, campaigns } from "@/lib/db/schema";

function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!camp || camp.orgId !== orgId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, id))
    .orderBy(asc(campaignRecipients.id));

  const header = "nombre,telefono,estado,error,wamid,enviado_en";
  const lines = rows.map((r) =>
    [
      csvCell(r.name),
      csvCell(r.phone),
      csvCell(r.status),
      csvCell(r.error),
      csvCell(r.wamid),
      csvCell(r.sentAt ? r.sentAt.toISOString() : ""),
    ].join(","),
  );
  const csv = `${[header, ...lines].join("\n")}\n`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="campana-${camp.name.replaceAll(/[^a-zA-Z0-9-_]/g, "_")}.csv"`,
    },
  });
}
