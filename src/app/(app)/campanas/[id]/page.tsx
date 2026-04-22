import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { campaigns } from "@/lib/db/schema";
import { Live } from "./live";

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!camp || camp.orgId !== orgId) notFound();

  const initial = {
    id: camp.id,
    name: camp.name,
    templateName: camp.templateName,
    templateLanguage: camp.templateLanguage,
    status: camp.status,
    total: camp.total,
    sent: camp.sent,
    delivered: camp.delivered,
    read: camp.read,
    failed: camp.failed,
    replied: camp.replied,
    scheduledAt: camp.scheduledAt ? camp.scheduledAt.toISOString() : null,
  };
  return <Live campaignId={id} initial={initial} />;
}
