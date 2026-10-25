import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, organization, user } from "@/lib/db/schema";
import {
  claimDueCampaign,
  recoverStuckCampaigns,
} from "@/app/api/cron/run-scheduled/route";

async function setupTest(db: ReturnType<typeof makeTestDb>["db"]) {
  const orgId = "test-org";
  const userId = "test-user";

  // Create organization
  await db.insert(organization).values({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    createdAt: new Date(),
  });

  // Create user
  await db.insert(user).values({
    id: userId,
    email: "test@example.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { db, orgId, userId };
}

describe("cron claim atomico y recuperacion", () => {
  it("doble claim solo marca una campaña draft como queued", async () => {
    const { db, orgId, userId } = await setupTest(makeTestDb().db);
    const campaignId = "test-campaign-1";

    // Create draft campaign
    await db.insert(campaigns).values({
      id: campaignId,
      orgId,
      name: "Test Campaign",
      templateName: "test_template",
      templateLanguage: "en",
      headerType: "NONE",
      source: "api",
      status: "draft",
      scheduledAt: new Date(Date.now() - 1000),
      total: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
      createdBy: userId,
      createdAt: new Date(),
    });

    // First claim should succeed
    const first = await claimDueCampaign(db, campaignId);
    expect(first).toBe(true);

    // Verify campaign is now queued
    const [camp1] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(camp1.status).toBe("queued");
    expect(camp1.statusChangedAt).not.toBeNull();

    // Second claim should fail (already queued)
    const second = await claimDueCampaign(db, campaignId);
    expect(second).toBe(false);

    // Verify status hasn't changed
    const [camp2] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(camp2.status).toBe("queued");
  });

  it("campañas sending viejas se recuperan a draft", async () => {
    const { db, orgId, userId } = await setupTest(makeTestDb().db);
    const stuckCampaignId = "stuck-campaign";
    const recentCampaignId = "recent-campaign";

    // Create stuck campaign (sending for 3 hours)
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    await db.insert(campaigns).values({
      id: stuckCampaignId,
      orgId,
      name: "Stuck Campaign",
      templateName: "test_template",
      templateLanguage: "en",
      headerType: "NONE",
      source: "api",
      status: "sending",
      statusChangedAt: threeHoursAgo,
      scheduledAt: new Date(),
      total: 10,
      sent: 5,
      delivered: 4,
      read: 0,
      failed: 1,
      replied: 0,
      createdBy: userId,
      createdAt: new Date(),
    });

    // Create recent campaign (latido reciente, dentro de los 10 min)
    const oneHourAgo = new Date(Date.now() - 5 * 60 * 1000);
    await db.insert(campaigns).values({
      id: recentCampaignId,
      orgId,
      name: "Recent Campaign",
      templateName: "test_template",
      templateLanguage: "en",
      headerType: "NONE",
      source: "api",
      status: "sending",
      statusChangedAt: oneHourAgo,
      scheduledAt: new Date(),
      total: 10,
      sent: 3,
      delivered: 2,
      read: 0,
      failed: 1,
      replied: 0,
      createdBy: userId,
      createdAt: new Date(),
    });

    // Run recovery
    const recovered = await recoverStuckCampaigns(db);

    // Only stuck campaign should be recovered
    expect(recovered).toContain(stuckCampaignId);
    expect(recovered).not.toContain(recentCampaignId);

    // Verify stuck campaign is now draft with new scheduledAt
    const [stuckCamp] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, stuckCampaignId));
    expect(stuckCamp.status).toBe("draft");
    expect(stuckCamp.statusChangedAt).not.toBeNull();
    expect(
      stuckCamp.scheduledAt?.getTime() ?? 0
    ).toBeGreaterThan(Date.now() - 1000); // Fresh scheduledAt

    // Verify recent campaign is still sending (statusChangedAt unchanged)
    const [recentCamp] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, recentCampaignId));
    expect(recentCamp.status).toBe("sending");
    // StatusChangedAt should still point to recent campaign's original time
    expect(recentCamp.statusChangedAt).not.toBeNull();
  });

  it("campaña sending sin statusChangedAt (vieja) se recupera", async () => {
    const { db, orgId, userId } = await setupTest(makeTestDb().db);
    const orphanCampaignId = "orphan-campaign";

    // Create old sending campaign without statusChangedAt
    await db.insert(campaigns).values({
      id: orphanCampaignId,
      orgId,
      name: "Orphan Campaign",
      templateName: "test_template",
      templateLanguage: "en",
      headerType: "NONE",
      source: "api",
      status: "sending",
      statusChangedAt: null,
      scheduledAt: new Date(),
      total: 10,
      sent: 5,
      delivered: 3,
      read: 0,
      failed: 2,
      replied: 0,
      createdBy: userId,
      createdAt: new Date(),
    });

    // Run recovery
    const recovered = await recoverStuckCampaigns(db);

    // Should recover campaign without statusChangedAt
    expect(recovered).toContain(orphanCampaignId);

    // Verify campaign is now draft
    const [camp] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, orphanCampaignId));
    expect(camp.status).toBe("draft");
    expect(camp.statusChangedAt).not.toBeNull();
  });

  it("recupera queued vencida y pasa sus filas sending a failed sin tocar las pending", async () => {
    const { db, orgId, userId } = await setupTest(makeTestDb().db);
    const base = {
      orgId, name: "C", templateName: "t", templateLanguage: "es", headerType: "NONE",
      source: "api", scheduledAt: new Date(), total: 3, createdBy: userId, createdAt: new Date(),
    };
    const old = new Date(Date.now() - 11 * 60 * 1000);
    await db.insert(campaigns).values([
      { ...base, id: "q-old", status: "queued", statusChangedAt: old, failed: 1 },
      { ...base, id: "q-fresh", status: "queued", statusChangedAt: new Date() },
    ]);
    await db.insert(campaignRecipients).values([
      { campaignId: "q-old", phone: "+1", params: "{}", status: "sending" },
      { campaignId: "q-old", phone: "+2", params: "{}", status: "sending" },
      { campaignId: "q-old", phone: "+3", params: "{}", status: "pending" },
      { campaignId: "q-fresh", phone: "+4", params: "{}", status: "sending" },
    ]);

    const recovered = await recoverStuckCampaigns(db);
    expect(recovered).toEqual(["q-old"]);

    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "q-old"));
    expect(c.status).toBe("draft");
    expect(c.failed).toBe(3);
    const recs = await db.select().from(campaignRecipients);
    const byPhone = Object.fromEntries(recs.map((r) => [r.phone, r]));
    expect(byPhone["+1"].status).toBe("failed");
    expect(byPhone["+1"].error).toBe("Envío interrumpido; revisa antes de reintentar");
    expect(byPhone["+2"].status).toBe("failed");
    expect(byPhone["+3"].status).toBe("pending");
    expect(byPhone["+4"].status).toBe("sending");
  });

  it("recupera sending con latido vencido y marca sus filas sending", async () => {
    const { db, orgId, userId } = await setupTest(makeTestDb().db);
    await db.insert(campaigns).values({
      id: "s-old", orgId, name: "C", templateName: "t", templateLanguage: "es", headerType: "NONE",
      source: "api", status: "sending", statusChangedAt: new Date(Date.now() - 11 * 60 * 1000),
      scheduledAt: new Date(), total: 1, createdBy: userId, createdAt: new Date(),
    });
    await db.insert(campaignRecipients).values({ campaignId: "s-old", phone: "+1", params: "{}", status: "sending" });
    expect(await recoverStuckCampaigns(db)).toEqual(["s-old"]);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "s-old"));
    expect(c.failed).toBe(1);
  });
});
