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
  conversations,
  messages,
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

  test("text inbound creates conversation and message", async () => {
    const db = await seed();
    await handleInboundMessage(
      db,
      "o",
      { from: "573001234567", id: "wamid.TEXT1", timestamp: "1", type: "text", text: { body: "hola desde webhook" } },
      ["STOP"],
    );

    const convs = await db.select().from(conversations).where(eq(conversations.orgId, "o"));
    expect(convs).toHaveLength(1);
    expect(convs[0].phone).toBe("+573001234567");
    expect(convs[0].unreadCount).toBe(1);

    const msgs = await db.select().from(messages).where(eq(messages.conversationId, convs[0].id));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("text");
    expect(msgs[0].body).toBe("hola desde webhook");
    expect(msgs[0].direction).toBe("in");
    expect(msgs[0].wamid).toBe("wamid.TEXT1");
  });

  test("media inbound stores mediaId", async () => {
    const db = await seed();
    await handleInboundMessage(
      db,
      "o",
      { from: "573001234567", id: "wamid.IMG1", timestamp: "1", type: "image", image: { id: "MEDIA123", mime_type: "image/jpeg", caption: "foto linda" } },
      ["STOP"],
    );

    const msgs = await db.select().from(messages);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("image");
    expect(msgs[0].mediaId).toBe("MEDIA123");
    expect(msgs[0].body).toBe("foto linda");
  });

  test("status delivered updates outbound message", async () => {
    const db = await seed();
    const { recordOutboundMessage } = await import("@/lib/inbox/store");
    const { getOrCreateConversation } = await import("@/lib/inbox/store");

    // Create a conversation first
    const conv = await getOrCreateConversation(db, "o", "+573001234567", new Date());

    // Record an outbound message
    const ts = new Date();
    await recordOutboundMessage(db, { orgId: "o", conversationId: conv.id, wamid: "wamid.OUT1", type: "text", body: "hola respuesta" });

    // Now trigger status update
    await handleStatusEvent(db, "o", {
      id: "wamid.OUT1",
      status: "delivered",
      timestamp: String(Math.floor(ts.getTime() / 1000)),
      recipient_id: "573001234567",
    });

    const msgs = await db.select().from(messages).where(eq(messages.wamid, "wamid.OUT1"));
    expect(msgs[0].status).toBe("delivered");
  });
});
