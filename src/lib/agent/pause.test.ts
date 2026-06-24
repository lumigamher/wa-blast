import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import { isPaused, pauseAgent, resumeAgent, setAgentPaused, setAgentTyping } from "./pause";

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

  it("setAgentPaused respeta orgId y togglea", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await setAgentPaused(db, "o1", "c1", true);
    expect(await isPaused(db, "c1")).toBe(true);
    await setAgentPaused(db, "o1", "c1", false);
    expect(await isPaused(db, "c1")).toBe(false);
    // org equivocada NO cambia
    await setAgentPaused(db, "o1", "c1", true);
    await setAgentPaused(db, "OTRA", "c1", false);
    expect(await isPaused(db, "c1")).toBe(true);
  });

  it("setAgentTyping setea y limpia agentTypingUntil", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const [convBefore] = await db.select({ agentTypingUntil: conversations.agentTypingUntil }).from(conversations).where(eq(conversations.id, "c1"));
    expect(convBefore.agentTypingUntil).toBeNull();

    const futureDate = new Date(Date.now() + 30_000);
    await setAgentTyping(db, "c1", futureDate);
    const [convAfter] = await db.select({ agentTypingUntil: conversations.agentTypingUntil }).from(conversations).where(eq(conversations.id, "c1"));
    expect(convAfter.agentTypingUntil).toBeDefined();
    expect(convAfter.agentTypingUntil?.getTime()).toBeLessThanOrEqual(futureDate.getTime());

    await setAgentTyping(db, "c1", null);
    const [convCleared] = await db.select({ agentTypingUntil: conversations.agentTypingUntil }).from(conversations).where(eq(conversations.id, "c1"));
    expect(convCleared.agentTypingUntil).toBeNull();
  });
});
