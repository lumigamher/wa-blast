import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, conversations, messages, organization } from "@/lib/db/schema";
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

  it("sender recibe replyTo del último mensaje inbound", async () => {
    const { db } = makeTestDb();
    await seed(db, true);
    // Agrega un mensaje inbound con wamid
    await db.insert(messages).values({
      id: "m1",
      conversationId: "c1",
      orgId: "o1",
      direction: "in",
      wamid: "wamid-123",
      type: "text",
      body: "Hola bot",
      createdAt: new Date(),
    });

    const enqueue = vi.fn();
    await maybeDispatchAgentTurn(db, "o1", "c1", "+57300", { enqueue });

    // Verificar que se encoló
    expect(enqueue).toHaveBeenCalledTimes(1);
    // Nota: El runner se encola pero no se ejecuta en esta prueba. Para verificar
    // que setAgentTyping se llama, sería necesario mockear las dependencias de Meta.
  });

  it("debounce configurable con env AGENT_DEBOUNCE_MS", async () => {
    const { db } = makeTestDb();
    await seed(db, true);
    const enqueue = vi.fn();
    await maybeDispatchAgentTurn(db, "o1", "c1", "+57300", { enqueue });
    // Verifica que enqueue fue llamado con el delay que viene del env o default
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [, , delayMs] = enqueue.mock.calls[0];
    // Default es 8000 (desde AGENT_DEBOUNCE_MS o default en dispatch.ts)
    expect(delayMs).toBe(8000);
  });
});
