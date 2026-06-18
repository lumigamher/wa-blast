import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaigns, campaignRecipients, organization, user } from "@/lib/db/schema";
import { cancelCampaign } from "@/lib/campaigns/manage";

async function seedCampaign(status: string, scheduledAt: Date | null = null) {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  await db.insert(organization).values({ id: "o2", name: "O2", createdAt: new Date() });
  await db.insert(user).values({ id: "u", email: "u@x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(campaigns).values({
    id: "camp1", orgId: "o", name: "Test", templateName: "promo", templateLanguage: "es",
    source: "adhoc", status, scheduledAt, createdBy: "u", createdAt: new Date(),
  });
  await db.insert(campaignRecipients).values({ campaignId: "camp1", phone: "+57300", params: "{}", status: "pending" });
  return { db };
}

describe("cancelCampaign", () => {
  test("draft → cancelled", async () => {
    const { db } = await seedCampaign("draft", new Date(Date.now() + 3_600_000));
    const r = await cancelCampaign(db, "o", "camp1");
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "camp1"));
    expect(c.status).toBe("cancelled");
  });

  test("rechaza si no es draft", async () => {
    const { db } = await seedCampaign("sending");
    const r = await cancelCampaign(db, "o", "camp1");
    expect(r.ok).toBe(false);
  });

  test("rechaza cross-org", async () => {
    const { db } = await seedCampaign("draft");
    const r = await cancelCampaign(db, "o2", "camp1");
    expect(r.ok).toBe(false);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "camp1"));
    expect(c.status).toBe("draft");
  });
});
