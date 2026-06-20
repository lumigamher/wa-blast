import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import { isPaused, pauseAgent, resumeAgent } from "./pause";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({
    id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date(),
  });
}

describe("agent pause", () => {
  it("pausa, consulta y reanuda", async () => {
    const { db } = makeTestDb();
    await seed(db);
    expect(await isPaused(db, "c1")).toBe(false);
    await pauseAgent(db, "c1");
    expect(await isPaused(db, "c1")).toBe(true);
    await resumeAgent(db, "c1");
    expect(await isPaused(db, "c1")).toBe(false);
  });
});
