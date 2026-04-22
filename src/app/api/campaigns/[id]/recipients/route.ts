import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { campaignRecipients, campaigns } from "@/lib/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!camp || camp.orgId !== orgId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db
    .select({
      id: campaignRecipients.id,
      phone: campaignRecipients.phone,
      name: campaignRecipients.name,
      status: campaignRecipients.status,
      error: campaignRecipients.error,
    })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, id))
    .orderBy(asc(campaignRecipients.id))
    .limit(500);
  return NextResponse.json(rows);
}
