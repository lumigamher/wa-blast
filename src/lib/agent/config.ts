import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentConfigs } from "@/lib/db/schema";

export type AgentConfig = typeof agentConfigs.$inferSelect;
type AgentConfigPatch = Partial<typeof agentConfigs.$inferInsert>;

const DEFAULTS = {
  enabled: false,
  name: "Asistente",
  systemPrompt: "",
  provider: "openai" as const,
  model: "gpt-5-mini",
  temperature: 0.2,
  businessHoursJson: null,
  fallbackMessage: "En un momento te atiende una persona del equipo.",
  maxStepsPerTurn: 5,
  monthlyCostCapCop: null,
  templateId: null,
  advancedMode: false,
};

export async function getAgentConfig(db: DB, orgId: string): Promise<AgentConfig> {
  const row = (
    await db.select().from(agentConfigs).where(eq(agentConfigs.orgId, orgId))
  )[0];
  if (row) return row;
  return { orgId, updatedAt: new Date(), ...DEFAULTS };
}

export async function saveAgentConfig(
  db: DB,
  orgId: string,
  patch: AgentConfigPatch,
): Promise<void> {
  const now = new Date();
  await db
    .insert(agentConfigs)
    .values({ orgId, ...DEFAULTS, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: agentConfigs.orgId,
      set: { ...patch, updatedAt: now },
    });
}
