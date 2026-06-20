import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentRuns, messages } from "@/lib/db/schema";
import { recordOutboundMessage } from "@/lib/inbox/store";
import { getAgentConfig } from "./config";
import { buildSystemPrompt, toLlmHistory } from "./context";
import { estimateCostCop } from "./cost";
import { isOverCostCap } from "./guardrails";
import { isPaused, pauseAgent } from "./pause";
import { getProvider } from "./providers";
import type { LlmProvider } from "./providers/types";
import { runAgentLoop } from "./runtime";
import { resolveTools } from "./tools/registry";

export type AgentSender = (input: { to: string; body: string }) => Promise<{ wamid: string | null }>;

const HISTORY_LIMIT = 20;

export async function runAgentTurn(
  db: DB,
  orgId: string,
  conversationId: string,
  deps: { provider?: LlmProvider; sender: AgentSender; to: string },
): Promise<void> {
  const config = await getAgentConfig(db, orgId);
  if (!config.enabled) return;
  if (await isPaused(db, conversationId)) return;

  const provider = deps.provider ?? getProvider({ provider: config.provider });
  const tools = await resolveTools(db, orgId);

  const rows = await db
    .select({ direction: messages.direction, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);
  const history = toLlmHistory(rows.reverse());

  if (await isOverCostCap(db, orgId, config.monthlyCostCapCop)) {
    await db.insert(agentRuns).values({
      id: randomUUID(), orgId, conversationId, stepsJson: "[]",
      promptTokens: 0, completionTokens: 0, costCop: 0, status: "capped", createdAt: new Date(),
    });
    return;
  }

  try {
    const res = await runAgentLoop({
      provider,
      model: config.model,
      temperature: config.temperature,
      system: buildSystemPrompt({ name: config.name, systemPrompt: config.systemPrompt }),
      history,
      tools,
      maxSteps: config.maxStepsPerTurn,
      ctx: { db, orgId, conversationId },
    });

    const costCop = estimateCostCop(res.usage, config.provider, config.model);

    if (res.status === "escalated") {
      await pauseAgent(db, conversationId);
    } else if (res.status === "ok" && res.reply) {
      const sent = await deps.sender({ to: deps.to, body: res.reply });
      await recordOutboundMessage(db, {
        orgId, conversationId, wamid: sent.wamid, type: "text", body: res.reply,
        status: sent.wamid ? "sent" : "failed",
      });
    } else if (res.status === "capped") {
      const sent = await deps.sender({ to: deps.to, body: config.fallbackMessage });
      await recordOutboundMessage(db, {
        orgId, conversationId, wamid: sent.wamid, type: "text", body: config.fallbackMessage,
        status: sent.wamid ? "sent" : "failed",
      });
    }

    await db.insert(agentRuns).values({
      id: randomUUID(), orgId, conversationId, stepsJson: JSON.stringify(res.steps),
      promptTokens: res.usage.promptTokens, completionTokens: res.usage.completionTokens,
      costCop, status: res.status, createdAt: new Date(),
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
