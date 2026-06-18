import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaigns, campaignRecipients, organization, user } from "@/lib/db/schema";
import { cancelCampaign, deleteCampaign, rescheduleCampaign } from "@/lib/campaigns/manage";

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

describe("deleteCampaign", () => {
  test("borra draft y sus destinatarios (cascade)", async () => {
    const { db } = await seedCampaign("draft");
    const r = await deleteCampaign(db, "o", "camp1");
    expect(r.ok).toBe(true);
    expect(await db.select().from(campaigns).where(eq(campaigns.id, "camp1"))).toHaveLength(0);
    expect(await db.select().from(campaignRecipients).where(eq(campaignRecipients.campaignId, "camp1"))).toHaveLength(0);
  });

  test("borra cancelled/done/failed", async () => {
    for (const s of ["cancelled", "done", "failed"]) {
      const { db } = await seedCampaign(s);
      expect((await deleteCampaign(db, "o", "camp1")).ok).toBe(true);
    }
  });

  test("rechaza queued/sending", async () => {
    for (const s of ["queued", "sending"]) {
      const { db } = await seedCampaign(s);
      const r = await deleteCampaign(db, "o", "camp1");
      expect(r.ok).toBe(false);
      expect(await db.select().from(campaigns).where(eq(campaigns.id, "camp1"))).toHaveLength(1);
    }
  });

  test("rechaza cross-org", async () => {
    const { db } = await seedCampaign("draft");
    expect((await deleteCampaign(db, "o2", "camp1")).ok).toBe(false);
    expect(await db.select().from(campaigns).where(eq(campaigns.id, "camp1"))).toHaveLength(1);
  });
});

describe("rescheduleCampaign", () => {
  test("draft + fecha futura → actualiza scheduledAt", async () => {
    const { db } = await seedCampaign("draft", new Date(Date.now() + 3_600_000));
    const futureTime = Date.now() + 7_200_000;
    const future = new Date(futureTime).toISOString();
    const r = await rescheduleCampaign(db, "o", "camp1", future);
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "camp1"));
    expect(c.scheduledAt?.getTime()).toBe(Math.floor(futureTime / 1000) * 1000);
  });

  test("rechaza fecha pasada", async () => {
    const { db } = await seedCampaign("draft");
    const r = await rescheduleCampaign(db, "o", "camp1", new Date(Date.now() - 3_600_000).toISOString());
    expect(r.ok).toBe(false);
  });

  test("rechaza si no es draft", async () => {
    const { db } = await seedCampaign("sending");
    const r = await rescheduleCampaign(db, "o", "camp1", new Date(Date.now() + 3_600_000).toISOString());
    expect(r.ok).toBe(false);
  });

  test("rechaza cross-org", async () => {
    const { db } = await seedCampaign("draft");
    const r = await rescheduleCampaign(db, "o2", "camp1", new Date(Date.now() + 3_600_000).toISOString());
    expect(r.ok).toBe(false);
  });
});
