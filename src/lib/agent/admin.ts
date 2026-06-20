import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentTools } from "@/lib/db/schema";
import { saveAgentConfig } from "./config";
import { BUILTIN_TOOLS } from "./tools/registry";

type ConfigInput = {
  enabled?: boolean;
  name?: string;
  systemPrompt?: string;
  provider?: "openai" | "anthropic";
  model?: string;
  temperature?: number;
  fallbackMessage?: string;
  monthlyCostCapCop?: number | null;
  advancedMode?: boolean;
  templateId?: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export async function updateAgentConfig(db: DB, orgId: string, input: ConfigInput): Promise<void> {
  const patch: ConfigInput = { ...input };
  if (input.provider && input.provider !== "openai" && input.provider !== "anthropic") {
    delete patch.provider;
  }
  if (typeof input.temperature === "number") patch.temperature = clamp(input.temperature, 0, 1);
  if (typeof input.name === "string") patch.name = input.name.slice(0, 80);
  await saveAgentConfig(db, orgId, patch);
}

export async function setAgentTool(db: DB, orgId: string, key: string, enabled: boolean): Promise<void> {
  if (!(key in BUILTIN_TOOLS)) throw new Error(`Tool desconocida: ${key}`);
  const existing = (
    await db.select().from(agentTools).where(and(eq(agentTools.orgId, orgId), eq(agentTools.key, key), eq(agentTools.type, "builtin")))
  )[0];
  if (existing) {
    await db.update(agentTools).set({ enabled }).where(eq(agentTools.id, existing.id));
  } else {
    await db.insert(agentTools).values({ id: randomUUID(), orgId, type: "builtin", key, enabled, configJson: "{}", createdAt: new Date() });
  }
}
