import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messages, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";

async function seed(db: DB) {
  await db.insert(organization).values({
    id: "o1",
    name: "Test Org",
    slug: "test-org",
    createdAt: new Date(),
  });
  await db.insert(conversations).values({
    id: "c1",
    orgId: "o1",
    phone: "+57300123456",
    lastMessageAt: new Date(),
    lastIncomingAt: null,
    unreadCount: 0,
    status: "open",
    createdAt: new Date(),
  });
}

describe("carousel inbox rendering", () => {
  it("inserts carousel message with cards and media URLs", async () => {
    const { db } = makeTestDb();
    await seed(db);

    const carouselPayload = {
      kind: "carousel",
      bodyText: "Mira el catálogo",
      cards: [
        {
          bodyText: "Anillo de oro",
          mediaUrl: "/api/inbox/media/asset-1",
          buttons: [
            {
              type: "URL" as const,
              text: "Ver",
            },
          ],
        },
        {
          bodyText: "Collar de plata",
          mediaUrl: "/api/inbox/media/asset-2",
          buttons: [
            {
              type: "QUICK_REPLY" as const,
              text: "Quiero este",
            },
          ],
        },
      ],
    };

    await db.insert(messages).values({
      id: "msg-car-1",
      conversationId: "c1",
      orgId: "o1",
      direction: "out",
      type: "template",
      body: "Mira el catálogo",
      status: "sent",
      wamid: "wamid.car1",
      payloadJson: JSON.stringify(carouselPayload),
      createdAt: new Date(),
    });

    // Verify the message was inserted
    const inserted = await db
      .select()
      .from(messages)
      .where(eq(messages.id, "msg-car-1"));

    expect(inserted).toHaveLength(1);
    expect(inserted[0].type).toBe("template");
    expect(inserted[0].body).toBe("Mira el catálogo");

    // Verify the payload contains carousel structure
    const payload = JSON.parse(inserted[0].payloadJson!);
    expect(payload.kind).toBe("carousel");
    expect(payload.bodyText).toBe("Mira el catálogo");
    expect(payload.cards).toHaveLength(2);

    // Verify first card
    expect(payload.cards[0].bodyText).toBe("Anillo de oro");
    expect(payload.cards[0].mediaUrl).toBe("/api/inbox/media/asset-1");
    expect(payload.cards[0].buttons).toHaveLength(1);
    expect(payload.cards[0].buttons[0].type).toBe("URL");

    // Verify second card
    expect(payload.cards[1].bodyText).toBe("Collar de plata");
    expect(payload.cards[1].mediaUrl).toBe("/api/inbox/media/asset-2");
    expect(payload.cards[1].buttons).toHaveLength(1);
    expect(payload.cards[1].buttons[0].type).toBe("QUICK_REPLY");
  });
});
