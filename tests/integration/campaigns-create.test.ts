import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, contacts, organization, user } from "@/lib/db/schema";
import { createCampaign } from "@/lib/campaigns/create";

async function seed() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  await db.insert(user).values({ id: "u", email: "u@x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(contacts).values([
    { id: "c1", orgId: "o", phone: "+57300", name: "A", customFields: "{}", createdAt: new Date(), updatedAt: new Date() },
    { id: "c2", orgId: "o", phone: "+57301", name: "B", customFields: "{}", createdAt: new Date(), updatedAt: new Date() },
    { id: "c3", orgId: "o", phone: "+57302", name: "C", customFields: "{}", optOutAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  ]);
  return { db };
}

describe("createCampaign", () => {
  test("from contact ids, skips opt-out, creates rows in one tx", async () => {
    const { db } = await seed();
    const { campaignId } = await createCampaign(db, {
      orgId: "o",
      createdBy: "u",
      name: "Test",
      templateName: "promo",
      templateLanguage: "es",
      headerType: "NONE",
      source: "segment",
      recipients: [
        { contactId: "c1", phone: "+57300", name: "A", params: {} },
        { contactId: "c2", phone: "+57301", name: "B", params: {} },
        { contactId: "c3", phone: "+57302", name: "C", params: {} },
      ],
    });

    const camp = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(camp[0].total).toBe(2);
    expect(camp[0].status).toBe("queued");
    const recs = await db.select().from(campaignRecipients).where(eq(campaignRecipients.campaignId, campaignId));
    expect(recs).toHaveLength(2);
  });
});
