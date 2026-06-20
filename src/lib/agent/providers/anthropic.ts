import type Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmResponse } from "./types";

export function makeAnthropicProvider(client: Anthropic): LlmProvider {
  return {
    async chat(input): Promise<LlmResponse> {
      const res = await client.messages.create({
        model: input.model,
        max_tokens: 1024,
        temperature: input.temperature,
        system: input.system,
        tools: input.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
        messages: input.messages.map((m) => {
          if (m.role === "tool")
            return {
              role: "user" as const,
              content: [{ type: "tool_result" as const, tool_use_id: m.toolCallId, content: m.content }],
            };
          if (m.role === "assistant")
            return {
              role: "assistant" as const,
              content: [
                ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
                ...(m.toolCalls?.map((c) => ({
                  type: "tool_use" as const,
                  id: c.id,
                  name: c.name,
                  input: JSON.parse(c.argsJson),
                })) ?? []),
              ],
            };
          return { role: "user" as const, content: m.content };
        }) as never,
      });

      let text: string | null = null;
      const toolCalls: LlmResponse["toolCalls"] = [];
      for (const block of res.content) {
        if (block.type === "text") text = (text ?? "") + block.text;
        if (block.type === "tool_use")
          toolCalls.push({ id: block.id, name: block.name, argsJson: JSON.stringify(block.input) });
      }
      return {
        text,
        toolCalls,
        usage: {
          promptTokens: res.usage.input_tokens,
          completionTokens: res.usage.output_tokens,
        },
      };
    },
  };
}
