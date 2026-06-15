import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messages, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordOutboundMessage } from "@/lib/inbox/store";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  const conv = await db.insert(conversations).values({
    id: "c1",
    orgId: "o1",
    phone: "+57300",
    lastMessageAt: new Date(),
    unreadCount: 0,
    createdAt: new Date(),
  });
  return conv;
}

describe("recordOutboundMessage con mediaId", () => {
  it("persiste mediaId cuando se proporciona", async () => {
    const { db } = makeTestDb();
    await seed(db);

    await recordOutboundMessage(db, {
      orgId: "o1",
      conversationId: "c1",
      wamid: "wamid.out1",
      type: "image",
      body: "Foto del producto",
      status: "sent",
      mediaId: "media_12345",
    });

    const msgs = await db.select().from(messages).where(eq(messages.conversationId, "c1"));
    expect(msgs.length).toBe(1);
    expect(msgs[0].mediaId).toBe("media_12345");
    expect(msgs[0].type).toBe("image");
    expect(msgs[0].body).toBe("Foto del producto");
  });

  it("persiste mediaId como null cuando no se proporciona", async () => {
    const { db } = makeTestDb();
    await seed(db);

    await recordOutboundMessage(db, {
      orgId: "o1",
      conversationId: "c1",
      wamid: "wamid.out2",
      type: "text",
      body: "Texto sin media",
      status: "sent",
    });

    const msgs = await db.select().from(messages).where(eq(messages.conversationId, "c1"));
    expect(msgs.length).toBe(1);
    expect(msgs[0].mediaId).toBeNull();
    expect(msgs[0].type).toBe("text");
  });

  it("persiste mediaId como null cuando se pasa explícitamente null", async () => {
    const { db } = makeTestDb();
    await seed(db);

    await recordOutboundMessage(db, {
      orgId: "o1",
      conversationId: "c1",
      wamid: "wamid.out3",
      type: "video",
      body: null,
      status: "sent",
      mediaId: null,
    });

    const msgs = await db.select().from(messages).where(eq(messages.conversationId, "c1"));
    expect(msgs.length).toBe(1);
    expect(msgs[0].mediaId).toBeNull();
  });
});
