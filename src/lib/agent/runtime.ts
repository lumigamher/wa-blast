import type { LlmMessage, LlmProvider } from "./providers/types";
import type { AgentTool, ToolContext, ToolResult } from "./tools/types";

export type AgentStep = {
  tool: string;
  args: unknown;
  result: unknown;
};

export type AgentTurnResult = {
  reply: string | null;
  status: "ok" | "capped" | "escalated" | "error";
  steps: AgentStep[];
  usage: { promptTokens: number; completionTokens: number };
};

export async function runAgentLoop(input: {
  provider: LlmProvider;
  model: string;
  temperature: number;
  system: string;
  history: LlmMessage[];
  tools: AgentTool[];
  maxSteps: number;
  ctx: ToolContext;
}): Promise<AgentTurnResult> {
  const { provider, model, temperature, system, tools, maxSteps, ctx } = input;
  const messages: LlmMessage[] = [...input.history];
  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.jsonSchema,
  }));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const steps: AgentStep[] = [];
  const usage = { promptTokens: 0, completionTokens: 0 };

  for (let i = 0; i < maxSteps; i++) {
    const res = await provider.chat({
      system,
      messages,
      tools: toolSchemas,
      temperature,
      model,
    });
    usage.promptTokens += res.usage.promptTokens;
    usage.completionTokens += res.usage.completionTokens;

    if (res.toolCalls.length === 0) {
      return { reply: res.text ?? "", status: "ok", steps, usage };
    }

    messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });

    for (const call of res.toolCalls) {
      const pushErr = (error: string) =>
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error }),
        });

      const tool = byName.get(call.name);
      if (!tool) {
        pushErr("tool desconocida");
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(call.argsJson);
      } catch {
        pushErr("args no son JSON");
        continue;
      }
      const parsed = tool.paramsSchema.safeParse(raw);
      if (!parsed.success) {
        pushErr("args inválidos");
        continue;
      }
      let result: ToolResult;
      try {
        result = await tool.run(parsed.data, ctx);
      } catch (e) {
        result = {
          ok: false,
          error: e instanceof Error ? e.message : "error en la herramienta",
        };
      }
      steps.push({ tool: call.name, args: parsed.data, result });
      if (tool.escalates && result.ok) {
        return { reply: null, status: "escalated", steps, usage };
      }
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
    }
  }

  return { reply: null, status: "capped", steps, usage };
}
