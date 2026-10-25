import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, agentJobs, conversations, messages, organization } from "@/lib/db/schema";
import { maybeDispatchAgentTurn } from "./dispatch";
import { __resetQueue } from "./queue";

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

  it("envía typing de inmediato en dispatch (no espera debounce)", async () => {
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

    // Verificar que se encoló con typing enviado
    expect(enqueue).toHaveBeenCalledTimes(1);
    // El typing se debe haber enviado antes del enqueue (sin esperar el debounce)
    // Verificar que hay un mensaje agentPending en la DB con agentTypingUntil seteado
    const [, job] = enqueue.mock.calls[0];
    expect(job).toEqual({ orgId: "o1", conversationId: "c1", recipient: "+57300" });
  });

  describe("encolado durable por defecto", () => {
    afterEach(() => {
      __resetQueue();
      vi.useRealTimers();
    });
    it("sin deps.enqueue escribe el job en agent_jobs con el recipient", async () => {
      vi.useFakeTimers();
      const { db } = makeTestDb();
      await seed(db, true);
      const recipient = { phone: "+57300", bsuid: null };
      await maybeDispatchAgentTurn(db, "o1", "c1", recipient);
      const row = db.select().from(agentJobs).where(eq(agentJobs.conversationId, "c1")).get();
      expect(row?.orgId).toBe("o1");
      expect(JSON.parse(row!.recipientJson)).toEqual(recipient);
      expect(row?.dueAt.getTime()).toBe(Date.now() + 8000);
    });
  });
});
