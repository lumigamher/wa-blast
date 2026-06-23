import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentConfigs } from "@/lib/db/schema";

export type AgentConfig = typeof agentConfigs.$inferSelect;
type AgentConfigPatch = Partial<typeof agentConfigs.$inferInsert>;

const DEFAULTS = {
  enabled: false,
  name: "Asistente",
  systemPrompt: "",
  temperature: 0.2,
  businessHoursJson: null,
  fallbackMessage: "En un momento te atiende una persona del equipo.",
  maxStepsPerTurn: 5,
  monthlyCostCapCop: null,
  templateId: null,
  advancedMode: false,
  checkoutFlowId: null,
};

export async function getAgentConfig(db: DB, orgId: string): Promise<AgentConfig> {
  const row = (
    await db.select().from(agentConfigs).where(eq(agentConfigs.orgId, orgId))
  )[0];
  if (row) return row;
  // DB schema has default values for provider and model; we construct the full default row here
  return {
    orgId,
    updatedAt: new Date(),
    provider: "openai",
    model: "gpt-5-mini",
    ...DEFAULTS,
  };
}

export async function saveAgentConfig(
  db: DB,
  orgId: string,
  patch: AgentConfigPatch,
): Promise<void> {
  const now = new Date();
  // DB schema defaults provide provider and model
  const defaults = {
    provider: "openai" as const,
    model: "gpt-5-mini",
    ...DEFAULTS,
  };
  await db
    .insert(agentConfigs)
    .values({ orgId, ...defaults, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: agentConfigs.orgId,
      set: { ...patch, updatedAt: now },
    });
}
