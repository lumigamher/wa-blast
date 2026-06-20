import type { z } from "zod";
import type { DB } from "@/lib/db/client";

export type ToolContext = {
  db: DB;
  orgId: string;
  conversationId: string;
};

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type AgentTool = {
  name: string;
  description: string;
  /** Validación de args (servidor). El LLM no la ve. */
  paramsSchema: z.ZodTypeAny;
  /** JSON Schema que SÍ ve el LLM (params). */
  jsonSchema: Record<string, unknown>;
  run(args: unknown, ctx: ToolContext): Promise<ToolResult>;
};
