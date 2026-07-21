import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentRuns, messages, conversations } from "@/lib/db/schema";
import { recordOutboundMessage } from "@/lib/inbox/store";
import { addNote } from "@/lib/inbox/notes";
import { getAgentConfig } from "./config";
import { buildSystemPrompt, toLlmHistory } from "./context";
import { estimateCostCop, estimateEmbeddingCostCop } from "./cost";
import { isOverCostCap } from "./guardrails";
import { isPaused, pauseAgent } from "./pause";
import { resolveChatProvider, resolveEmbeddingProvider } from "@/lib/ai/gateway/resolve";
import { getGatewayConfig } from "@/lib/ai/gateway/config";
import type { LlmProvider } from "./providers/types";
import { runAgentLoop } from "./runtime";
import { resolveTools } from "./tools/registry";
import type { EmbeddingProvider } from "./rag/embeddings/types";
import { retrieveKnowledge } from "./rag";
import { buildCustomerProfile } from "./customer/profile";

export type AgentSender = (input: { to: string; body: string; replyTo?: string }) => Promise<{ wamid: string | null }>;

const HISTORY_LIMIT = Number(process.env.AGENT_HISTORY_LIMIT ?? 10);

export async function runAgentTurn(
  db: DB,
  orgId: string,
  conversationId: string,
  deps: { provider?: LlmProvider; embeddings?: EmbeddingProvider; sender: AgentSender; to: string },
): Promise<void> {
  const config = await getAgentConfig(db, orgId);
  if (!config.enabled) return;
  if (await isPaused(db, conversationId)) return;

  // Verify conversation belongs to org (defense-in-depth)
  const [conv] = await db
    .select({ orgId: conversations.orgId })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (!conv || conv.orgId !== orgId) return;

  // Load messages and compute last inbound wamid for reply quote
  const rows = await db
    .select({ direction: messages.direction, body: messages.body, wamid: messages.wamid })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);
  const lastInboundMsg = rows.find((m) => m.direction === "in");
  const lastInboundWamid = lastInboundMsg?.wamid ?? undefined;

  // Resolve chat provider: from deps (test injection) or from gateway (org BYO key)
  let chatProvider: LlmProvider;
  let chatModel: string;
  let chatProviderKind: "openai" | "anthropic";

  if (deps.provider) {
    // Test injection
    chatProvider = deps.provider;
    chatModel = "gpt-5-mini";
    chatProviderKind = "openai";
  } else {
    // Resolve from gateway; if no key → send fallback and return
    const resolved = await resolveChatProvider(db, orgId);
    if (!resolved.ok) {
      // No usable gateway config: send fallback message and return gracefully
      const sent = await deps.sender({ to: deps.to, body: config.fallbackMessage, replyTo: lastInboundWamid });
      await recordOutboundMessage(db, {
        orgId, conversationId, wamid: sent.wamid, type: "text", body: config.fallbackMessage,
        status: sent.wamid ? "sent" : "failed",
      });
      return;
    }
    chatProvider = resolved.provider;
    chatModel = resolved.model;
    const gatewayCfg = await getGatewayConfig(db, orgId);
    chatProviderKind = gatewayCfg?.chatProvider ?? "openai";
  }

  const tools = await resolveTools(db, orgId);

  const history = toLlmHistory(rows.reverse());

  // Auto-RAG: recupera info de los documentos de la org relevante al último mensaje del cliente.
  const lastIncoming = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  let knowledge = "";
  if (typeof lastIncoming === "string" && lastIncoming.trim()) {
    try {
      const embeddings = deps.embeddings ?? (await resolveEmbeddingProvider(db, orgId));
      if (embeddings) {
        knowledge = await retrieveKnowledge(db, orgId, lastIncoming, { embeddings });
      }
    } catch {
      // Falla de embeddings/RAG no debe romper el turno: seguimos sin conocimiento.
      knowledge = "";
    }
  }

  // Build customer profile from contact facts + orders
  let customerProfile = "";
  try {
    customerProfile = await buildCustomerProfile(db, orgId, conversationId);
  } catch {
    customerProfile = "";
  }

  if (await isOverCostCap(db, orgId, config.monthlyCostCapCop)) {
    await db.insert(agentRuns).values({
      id: randomUUID(), orgId, conversationId, stepsJson: "[]",
      promptTokens: 0, completionTokens: 0, costCop: 0, status: "capped", createdAt: new Date(),
    });
    return;
  }

  try {
    const res = await runAgentLoop({
      provider: chatProvider,
      model: chatModel,
      temperature: config.temperature,
      system: buildSystemPrompt({
        name: config.name,
        systemPrompt: config.systemPrompt,
        customerProfile,
        knowledge,
        toolNames: tools.map((t) => t.name),
      }),
      history,
      tools,
      maxSteps: config.maxStepsPerTurn,
      ctx: { db, orgId, conversationId },
    });

    const costCop = estimateCostCop(res.usage, chatProviderKind, chatModel);

    // Estimate embedding cost toward cap (roughly ~4 chars/token)
    const embedTokens = knowledge ? Math.ceil(lastIncoming.length / 4) : 0;
    const embedCostCop = estimateEmbeddingCostCop(embedTokens);
    const totalCostCop = costCop + embedCostCop;

    if (res.status === "escalated") {
      // 1) Aviso amable al cliente (no lo dejamos en silencio).
      const handoff = "Permíteme un momento 🙏 Un compañero del equipo continúa contigo enseguida para ayudarte.";
      const sent = await deps.sender({ to: deps.to, body: handoff, replyTo: lastInboundWamid });
      await recordOutboundMessage(db, {
        orgId, conversationId, wamid: sent.wamid, type: "text", body: handoff,
        status: sent.wamid ? "sent" : "failed",
      });
      // 2) Nota interna para el humano con el contexto del escalado.
      const escalateStep = res.steps.find((s) => s.tool === "escalar_a_humano");
      const motivo = (escalateStep?.result as { data?: { motivo?: string } } | undefined)?.data?.motivo;
      if (motivo) {
        await addNote(db, orgId, {
          conversationId,
          authorUserId: null,
          authorName: config.name || "Asistente IA",
          body: `Escalado por la IA — contexto:\n${motivo}`,
        }).catch(() => {
          // Falla al crear nota no debe romper el escalado
        });
      }
      // 3) Pausar la IA (handoff).
      await pauseAgent(db, conversationId);
    } else if (res.status === "ok" && res.reply) {
      const sent = await deps.sender({ to: deps.to, body: res.reply, replyTo: lastInboundWamid });
      await recordOutboundMessage(db, {
        orgId, conversationId, wamid: sent.wamid, type: "text", body: res.reply,
        status: sent.wamid ? "sent" : "failed",
      });
    } else if (res.status === "capped") {
      const sent = await deps.sender({ to: deps.to, body: config.fallbackMessage, replyTo: lastInboundWamid });
      await recordOutboundMessage(db, {
        orgId, conversationId, wamid: sent.wamid, type: "text", body: config.fallbackMessage,
        status: sent.wamid ? "sent" : "failed",
      });
    }

    await db.insert(agentRuns).values({
      id: randomUUID(), orgId, conversationId, stepsJson: JSON.stringify(res.steps),
      promptTokens: res.usage.promptTokens, completionTokens: res.usage.completionTokens,
      costCop: totalCostCop, status: res.status, createdAt: new Date(),
    });
  } catch (e) {
    // Falla del provider/Meta: registra un run "error" para observabilidad.
    await db.insert(agentRuns).values({
      id: randomUUID(), orgId, conversationId, stepsJson: "[]",
      promptTokens: 0, completionTokens: 0, costCop: 0, status: "error",
      errorMessage: e instanceof Error ? e.message : "error desconocido",
      createdAt: new Date(),
    });
  }
}
