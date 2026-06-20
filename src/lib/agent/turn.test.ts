import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, agentRuns, agentTools, conversations, messages, organization } from "@/lib/db/schema";
import { makeFakeProvider } from "./testing/fake-provider";
import { runAgentTurn } from "./turn";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
  await db.insert(messages).values({ id: "m1", conversationId: "c1", orgId: "o1", direction: "in", wamid: "w1", type: "text", body: "hola", createdAt: new Date() });
  await db.insert(agentConfigs).values({ orgId: "o1", enabled: true, name: "Bot", systemPrompt: "Saluda", provider: "openai", model: "gpt-5-mini", temperature: 0, fallbackMessage: "ya te atienden", maxStepsPerTurn: 5, advancedMode: false, updatedAt: new Date() });
  await db.insert(agentTools).values({ id: randomUUID(), orgId: "o1", type: "builtin", key: "calcular_total", enabled: true, configJson: "{}", createdAt: new Date() });
}

describe("runAgentTurn", () => {
  it("agente ON: responde y registra run", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const provider = makeFakeProvider([{ text: "¡Hola! ¿En qué te ayudo?", toolCalls: [], usage: { promptTokens: 10, completionTokens: 5 } }]);
    const sender = vi.fn(async () => ({ wamid: "out1" }));
    await runAgentTurn(db, "o1", "c1", { provider, sender, to: "+57300" });
    expect(sender).toHaveBeenCalledWith({ to: "+57300", body: "¡Hola! ¿En qué te ayudo?" });
    const out = await db.select().from(messages).where(eq(messages.conversationId, "c1"));
    expect(out.some((m) => m.direction === "out" && m.body === "¡Hola! ¿En qué te ayudo?")).toBe(true);
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o1"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("ok");
  });

  it("agente OFF: no hace nada", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.update(agentConfigs).set({ enabled: false }).where(eq(agentConfigs.orgId, "o1"));
    const sender = vi.fn(async () => ({ wamid: "x" }));
    await runAgentTurn(db, "o1", "c1", { provider: makeFakeProvider([]), sender, to: "+57300" });
    expect(sender).not.toHaveBeenCalled();
  });

  it("conversación pausada: no responde", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.update(conversations).set({ agentPaused: true }).where(eq(conversations.id, "c1"));
    const sender = vi.fn(async () => ({ wamid: "x" }));
    await runAgentTurn(db, "o1", "c1", { provider: makeFakeProvider([]), sender, to: "+57300" });
    expect(sender).not.toHaveBeenCalled();
  });

  it("escalado: pausa y no envía", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(agentTools).values({ id: randomUUID(), orgId: "o1", type: "builtin", key: "escalar_a_humano", enabled: true, configJson: "{}", createdAt: new Date() });
    const provider = makeFakeProvider([{ text: null, toolCalls: [{ id: "t1", name: "escalar_a_humano", argsJson: JSON.stringify({ motivo: "pide humano" }) }], usage: { promptTokens: 3, completionTokens: 1 } }]);
    const sender = vi.fn(async () => ({ wamid: "x" }));
    await runAgentTurn(db, "o1", "c1", { provider, sender, to: "+57300" });
    expect(sender).not.toHaveBeenCalled();
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, "c1"));
    expect(conv.agentPaused).toBe(true);
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o1"));
    expect(runs[0].status).toBe("escalated");
  });

  it("paso a paso agotado (capped): envía fallback y lo registra", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db
      .update(agentConfigs)
      .set({ maxStepsPerTurn: 2 })
      .where(eq(agentConfigs.orgId, "o1"));
    const toolCall = {
      text: null,
      toolCalls: [
        {
          id: "t1",
          name: "calcular_total",
          argsJson: JSON.stringify({
            items: [{ nombre: "x", cantidad: 1, precioUnitario: 1 }],
          }),
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1 },
    };
    const provider = makeFakeProvider([toolCall, toolCall, toolCall]);
    const sender = vi.fn(async () => ({ wamid: "fb1" }));
    await runAgentTurn(db, "o1", "c1", { provider, sender, to: "+57300" });
    expect(sender).toHaveBeenCalledWith({ to: "+57300", body: "ya te atienden" });
    const out = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, "c1"));
    expect(
      out.some((m) => m.direction === "out" && m.body === "ya te atienden"),
    ).toBe(true);
    const runs = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.orgId, "o1"));
    expect(runs[0].status).toBe("capped");
  });
});
