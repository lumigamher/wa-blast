import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messageReactions, messages, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { handleInboundMessage } from "@/lib/meta/webhook-handlers";
import type { DB } from "@/lib/db/client";

async function seed(db: DB) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
}

describe("webhook reacción entrante", () => {
  it("vincula la reacción y NO crea mensaje", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await handleInboundMessage(db, "o1", {
      from: "57300", id: "wamid.R", timestamp: "1700000000", type: "reaction",
      reaction: { message_id: "wamid.TARGET", emoji: "👍" },
    }, [], null, { phone: "+57300" });
    const rx = await db.select().from(messageReactions).where(eq(messageReactions.targetWamid, "wamid.TARGET"));
    expect(rx.length).toBe(1);
    expect(rx[0].emoji).toBe("👍");
    const msgs = await db.select().from(messages).where(eq(messages.orgId, "o1"));
    expect(msgs.filter((m) => m.type === "reaction").length).toBe(0);
  });
});
