import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import {
  campaignRecipients,
  campaigns,
  contacts,
  messageEvents,
  organization,
  organizationSettings,
  user,
} from "@/lib/db/schema";
import { handleInboundMessage, handleStatusEvent } from "@/lib/meta/webhook-handlers";

async function seed() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  await db.insert(organizationSettings).values({ orgId: "o", metaPhoneId: "111", updatedAt: new Date() });
  await db.insert(user).values({
    id: "u",
    email: "u@x",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(contacts).values({
    id: "c1",
    orgId: "o",
    phone: "+573001234567",
    name: "A",
    customFields: "{}",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(campaigns).values({
    id: "camp",
    orgId: "o",
    name: "T",
    templateName: "x",
    templateLanguage: "es",
    headerType: "NONE",
    source: "adhoc",
    status: "sending",
    total: 1,
    sent: 1,
    createdBy: "u",
    createdAt: new Date(),
  });
  await db.insert(campaignRecipients).values({
    id: 1,
    campaignId: "camp",
    contactId: "c1",
    phone: "+573001234567",
    status: "sent",
    wamid: "wamid.AAA",
    params: "{}",
    sentAt: new Date(Date.now() - 60_000),
  });
  return db;
}

describe("status event", () => {
  test("delivered increments delivered and writes event", async () => {
    const db = await seed();
    await handleStatusEvent(db, "o", {
      id: "wamid.AAA",
      status: "delivered",
      timestamp: "1",
      recipient_id: "573001234567",
    });

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.delivered).toBe(1);
    const ev = await db.select().from(messageEvents);
    expect(ev).toHaveLength(1);
    expect(ev[0].event).toBe("delivered");
  });
});

describe("inbound message", () => {
  test("STOP keyword sets contact opt_out_at", async () => {
    const db = await seed();
    await handleInboundMessage(
      db,
      "o",
      { from: "573001234567", id: "wamid.IN", timestamp: "1", type: "text", text: { body: "STOP" } },
      ["STOP", "BAJA"],
    );

    const [c] = await db.select().from(contacts).where(eq(contacts.id, "c1"));
    expect(c.optOutAt).not.toBeNull();
  });

  test("non-opt-out reply increments campaign.replied", async () => {
    const db = await seed();
    await handleInboundMessage(
      db,
      "o",
      { from: "573001234567", id: "wamid.IN2", timestamp: "1", type: "text", text: { body: "hola, quiero info" } },
      ["STOP"],
    );

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.replied).toBe(1);
  });
});
