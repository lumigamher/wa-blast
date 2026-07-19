import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaigns, campaignRecipients, organization, user } from "@/lib/db/schema";
import { handleStatusEvent, handleInboundMessage } from "@/lib/meta/webhook-handlers";

async function setupTest(db: any) {
  const orgId = "test-org";
  const userId = "test-user";
  const campaignId = "test-campaign";

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

  // Create campaign
  await db.insert(campaigns).values({
    id: campaignId,
    orgId,
    name: "Test Campaign",
    templateName: "test_template",
    templateLanguage: "en",
    headerType: "NONE",
    source: "api",
    status: "sent",
    total: 1,
    sent: 1,
    delivered: 0,
    read: 0,
    failed: 0,
    replied: 0,
    createdBy: userId,
    createdAt: new Date(),
  });

  // Create campaign recipient with sent status
  await db.insert(campaignRecipients).values({
    campaignId,
    phone: "+573001112233",
    status: "sent",
    wamid: "wamid.A",
    sentAt: new Date(),
  });

  return { db, orgId, userId, campaignId };
}

describe("idempotencia de webhooks", () => {
  it("un status 'delivered' retransmitido solo incrementa una vez", async () => {
    const { db, orgId, campaignId } = await setupTest(makeTestDb().db);

    const status = {
      id: "wamid.A",
      status: "delivered" as const,
      timestamp: "1700000000",
      recipient_id: "573001112233",
    };

    // First transmission
    await handleStatusEvent(db, orgId, status);

    // Second transmission (retransmisión de Meta)
    await handleStatusEvent(db, orgId, status);

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(camp.delivered).toBe(1);
  });

  it("un mensaje entrante retransmitido solo cuenta un reply", async () => {
    const { db, orgId, campaignId } = await setupTest(makeTestDb().db);

    const msg = {
      from: "573001112233",
      id: "wamid.IN1",
      timestamp: "1700000100",
      type: "text",
      text: { body: "info" },
    };

    // First transmission
    await handleInboundMessage(db, orgId, msg, []);

    // Second transmission (retransmisión de Meta)
    await handleInboundMessage(db, orgId, msg, []);

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(camp.replied).toBe(1);
  });

  it("sent→delivered→read del mismo wamid son eventos distintos y pasan todos", async () => {
    const { db, orgId, campaignId } = await setupTest(makeTestDb().db);

    const baseStatus = {
      id: "wamid.DISTINCT",
      timestamp: "1700000000",
      recipient_id: "573001112233",
    };

    // Add recipient for this test
    await db.insert(campaignRecipients).values({
      campaignId,
      phone: "+573001112233",
      status: "sent",
      wamid: "wamid.DISTINCT",
      sentAt: new Date(),
    });

    // Process sent event
    await handleStatusEvent(db, orgId, { ...baseStatus, status: "sent" as const });
    let camp = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).then((r) => r[0]);
    expect(camp.delivered).toBe(0);

    // Process delivered event
    await handleStatusEvent(db, orgId, { ...baseStatus, status: "delivered" as const });
    camp = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).then((r) => r[0]);
    expect(camp.delivered).toBe(1);

    // Process read event
    await handleStatusEvent(db, orgId, { ...baseStatus, status: "read" as const });
    camp = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).then((r) => r[0]);
    expect(camp.read).toBe(1);
  });
});
