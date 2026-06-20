import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, conversations, organization } from "@/lib/db/schema";
import { maybeDispatchAgentTurn } from "./dispatch";

async function seed(db: ReturnType<typeof makeTestDb>["db"], enabled: boolean) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
  await db.insert(agentConfigs).values({ orgId: "o1", enabled, name: "B", systemPrompt: "", provider: "openai", model: "gpt-5-mini", temperature: 0, fallbackMessage: "x", maxStepsPerTurn: 5, advancedMode: false, updatedAt: new Date() });
}

describe("maybeDispatchAgentTurn", () => {
  it("encola si agente ON y no pausado", async () => {
    const { db } = makeTestDb();
    await seed(db, true);
    const enqueue = vi.fn();
    await maybeDispatchAgentTurn(db, "o1", "c1", "+57300", { enqueue });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it("no encola si agente OFF", async () => {
    const { db } = makeTestDb();
    await seed(db, false);
    const enqueue = vi.fn();
    await maybeDispatchAgentTurn(db, "o1", "c1", "+57300", { enqueue });
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("no encola si la conversación está pausada", async () => {
    const { db } = makeTestDb();
    await seed(db, true);
    await db.update(conversations).set({ agentPaused: true }).where(eq(conversations.id, "c1"));
    const enqueue = vi.fn();
    await maybeDispatchAgentTurn(db, "o1", "c1", "+57300", { enqueue });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
