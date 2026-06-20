import type { LlmMessage, LlmProvider } from "./providers/types";
import type { AgentTool, ToolContext } from "./tools/types";

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
      const tool = byName.get(call.name);
      if (!tool) {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error: "tool desconocida" }),
        });
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(call.argsJson);
      } catch {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error: "args no son JSON" }),
        });
        continue;
      }
      const parsed = tool.paramsSchema.safeParse(raw);
      if (!parsed.success) {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error: "args inválidos" }),
        });
        continue;
      }
      const result = await tool.run(parsed.data, ctx);
      steps.push({ tool: call.name, args: parsed.data, result });
      if (call.name === "escalar_a_humano" && result.ok) {
        return { reply: null, status: "escalated", steps, usage };
      }
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
    }
  }

  return { reply: null, status: "capped", steps, usage };
}
