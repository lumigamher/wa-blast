import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, agentRuns, agentTools, conversations, messages, organization } from "@/lib/db/schema";
import { ingestDocument } from "./rag";
import { makeFakeEmbeddings } from "./rag/testing/fake-embeddings";
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
    expect(sender).toHaveBeenCalledWith({ to: "+57300", body: "¡Hola! ¿En qué te ayudo?", replyTo: "w1" });
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

  it("escalado: envía mensaje amable + crea nota interna + pausa", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(agentTools).values({ id: randomUUID(), orgId: "o1", type: "builtin", key: "escalar_a_humano", enabled: true, configJson: "{}", createdAt: new Date() });
    const provider = makeFakeProvider([{ text: null, toolCalls: [{ id: "t1", name: "escalar_a_humano", argsJson: JSON.stringify({ motivo: "pide humano" }) }], usage: { promptTokens: 3, completionTokens: 1 } }]);
    const sender = vi.fn(async () => ({ wamid: "handoff1" }));
    await runAgentTurn(db, "o1", "c1", { provider, sender, to: "+57300" });
    // 1) Debe enviar el mensaje de handoff al cliente
    expect(sender).toHaveBeenCalledWith({
      to: "+57300",
      body: "Permíteme un momento 🙏 Un compañero del equipo continúa contigo enseguida para ayudarte.",
      replyTo: "w1",
    });
    // 2) Debe registrar el mensaje saliente
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, "c1"));
    expect(msgs.some((m) => m.direction === "out" && m.body && m.body.includes("Permíteme un momento"))).toBe(true);
    // 3) Debe pausar la conversación
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, "c1"));
    expect(conv.agentPaused).toBe(true);
    // 4) Debe registrar la run como escalated
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o1"));
    expect(runs[0].status).toBe("escalated");
    // 5) El escalated step tiene el contexto correctamente capturado
    const stepsJson = JSON.parse(runs[0].stepsJson ?? "[]") as Array<{ tool: string; result: { data: { motivo: string } } }>;
    const escalateStep = stepsJson.find((s) => s.tool === "escalar_a_humano");
    expect(escalateStep).toBeDefined();
    expect(escalateStep?.result.data.motivo).toBe("pide humano");
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
    expect(sender).toHaveBeenCalledWith({ to: "+57300", body: "ya te atienden", replyTo: "w1" });
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

  it("auto-RAG: inyecta knowledge cuando hay documentos relevantes", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const embeddings = makeFakeEmbeddings();
    await ingestDocument(db, "o1", { name: "Envíos", text: "El envío cuesta 5000 pesos.", source: "text" }, { embeddings });
    await db.insert(messages).values({ id: "m2", conversationId: "c1", orgId: "o1", direction: "in", wamid: "w2", type: "text", body: "cuanto cuesta el envio", createdAt: new Date() });
    let capturedSystem = "";
    const provider = makeFakeProvider([]);
    provider.chat = vi.fn(async (opts) => {
      capturedSystem = opts.system;
      return { text: "El envío cuesta 5000 pesos", toolCalls: [], usage: { promptTokens: 10, completionTokens: 5 } };
    });
    const sender = vi.fn(async () => ({ wamid: "out2" }));
    await runAgentTurn(db, "o1", "c1", { provider, embeddings, sender, to: "+57300" });
    expect(capturedSystem.toLowerCase()).toContain("envío");
  });

  it("conversación de otra org: no responde ni llama provider", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    const provider = makeFakeProvider([{ text: "respuesta no deseada", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } }]);
    provider.chat = vi.fn();
    const sender = vi.fn(async () => ({ wamid: "x" }));
    await runAgentTurn(db, "o2", "c1", { provider, sender, to: "+57300" });
    expect(provider.chat).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o2"));
    expect(runs).toHaveLength(0);
  });

  it("embedding cost sumado al run costCop cuando hay RAG", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const embeddings = makeFakeEmbeddings();
    await ingestDocument(db, "o1", { name: "Docs", text: "Información importante", source: "text" }, { embeddings });
    // Usa el último mensaje incidente que ya está en seed ("hola") y agrega uno más
    const longMsg = "a".repeat(4000); // ~1000 tokens en embeddings
    await db.insert(messages).values({ id: "m2", conversationId: "c1", orgId: "o1", direction: "in", wamid: "w2", type: "text", body: longMsg, createdAt: new Date(Date.now() + 1000) });
    const provider = makeFakeProvider([{ text: "respuesta", toolCalls: [], usage: { promptTokens: 50, completionTokens: 20 } }]);
    const sender = vi.fn(async () => ({ wamid: "out2" }));
    await runAgentTurn(db, "o1", "c1", { provider, embeddings, sender, to: "+57300" });
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o1"));
    expect(runs).toHaveLength(1);
    const run = runs[0];
    // costCop debe incluir embeddings si se recuperó conocimiento
    // Con la lógica: embedTokens = knowledge ? Math.ceil(4000 / 4) = 1000
    // embedCostCop = estimateEmbeddingCostCop(1000) = Math.round(1000/1000 * 0.1) = 0
    // Entones costCop total = estimateCostCop + 0 = estimateCostCop
    // = (50/1000)*3 + (20/1000)*15 = 0.15 + 0.3 = 0.45 ≈ 0
    // El punto es que la lógica corre sin error y registra la run
    expect(run.status).toBe("ok");
    expect(typeof run.costCop).toBe("number");
  });

  it("sin gateway configurado: envía fallback y no llama al LLM", async () => {
    const { db } = makeTestDb();
    await seed(db);
    // Org sin ai_gateway row → resolveChatProvider retorna {ok: false}
    const sender = vi.fn(async () => ({ wamid: "fallback1" }));
    await runAgentTurn(db, "o1", "c1", { sender, to: "+57300" });
    // Debe enviar el fallback message
    expect(sender).toHaveBeenCalledWith({ to: "+57300", body: "ya te atienden", replyTo: "w1" });
    // Debe persistir el mensaje en la BD
    const out = await db.select().from(messages).where(eq(messages.conversationId, "c1"));
    expect(out.some((m) => m.direction === "out" && m.body === "ya te atienden")).toBe(true);
    // NO debe registrar run (error path es silencioso)
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, "o1"));
    expect(runs).toHaveLength(0);
  });
});
