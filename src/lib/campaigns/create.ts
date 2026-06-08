import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaignRecipients, campaigns, contacts } from "@/lib/db/schema";

export type CreateCampaignInput = {
  orgId: string;
  createdBy: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  headerType: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerHandle?: string | null;
  templateType?: "standard" | "carousel";
  componentPlanJson?: string | null;
  source: "segment" | "adhoc";
  segmentId?: string | null;
  scheduledAt?: Date | null;
  recipients: { contactId?: string; phone: string; name?: string | null; params: Record<string, string> }[];
};

export async function createCampaign(
  db: DB,
  input: CreateCampaignInput,
): Promise<{ campaignId: string; total: number }> {
  const campaignId = `camp_${crypto.randomUUID()}`;
  const now = new Date();

  const contactIds = input.recipients.map((r) => r.contactId).filter(Boolean) as string[];
  const optedOut = new Set<string>();
  if (contactIds.length > 0) {
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, input.orgId), inArray(contacts.id, contactIds), isNull(contacts.optOutAt)));
    const validIds = new Set(rows.map((r) => r.id));
    for (const id of contactIds) if (!validIds.has(id)) optedOut.add(id);
  }

  const filtered = input.recipients.filter((r) => !(r.contactId && optedOut.has(r.contactId)));

  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id: campaignId,
      orgId: input.orgId,
      name: input.name,
      templateName: input.templateName,
      templateLanguage: input.templateLanguage,
      headerType: input.headerType,
      headerHandle: input.headerHandle ?? null,
      templateType: input.templateType ?? "standard",
      componentPlanJson: input.componentPlanJson ?? null,
      source: input.source,
      segmentId: input.segmentId ?? null,
      scheduledAt: input.scheduledAt ?? null,
      status: input.scheduledAt ? "draft" : "queued",
      total: filtered.length,
      createdBy: input.createdBy,
      createdAt: now,
    });
    if (filtered.length > 0) {
      await tx.insert(campaignRecipients).values(
        filtered.map((r) => ({
          campaignId,
          contactId: r.contactId ?? null,
          phone: r.phone,
          name: r.name ?? null,
          params: JSON.stringify(r.params),
          status: "pending" as const,
        })),
      );
    }
  });

  return { campaignId, total: filtered.length };
}
