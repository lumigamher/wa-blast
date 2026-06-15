import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import { getReactionsForMessages, upsertReaction } from "@/lib/inbox/reactions";
import type { DB } from "@/lib/db/client";

async function seed(db: DB) {
  await db
    .insert(organization)
    .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({
    id: "c1",
    orgId: "o1",
    phone: "+57300",
    lastMessageAt: new Date(),
    unreadCount: 0,
    createdAt: new Date(),
  });
}

describe("reactions", () => {
  it("upsert crea y luego reemplaza la reacción del mismo lado", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.A",
      direction: "in",
      emoji: "👍",
    });
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.A",
      direction: "in",
      emoji: "❤️",
    });
    const map = await getReactionsForMessages(db, "o1", ["wamid.A"]);
    expect(map.get("wamid.A")).toEqual([{ direction: "in", emoji: "❤️" }]);
  });

  it("emoji vacío elimina la reacción", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.A",
      direction: "in",
      emoji: "👍",
    });
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.A",
      direction: "in",
      emoji: "",
    });
    const map = await getReactionsForMessages(db, "o1", ["wamid.A"]);
    expect(map.get("wamid.A")).toBeUndefined();
  });

  it("entrante y saliente coexisten en el mismo mensaje", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.A",
      direction: "in",
      emoji: "👍",
    });
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.A",
      direction: "out",
      emoji: "🙏",
    });
    const map = await getReactionsForMessages(db, "o1", ["wamid.A"]);
    expect(map.get("wamid.A")?.length).toBe(2);
  });
});
