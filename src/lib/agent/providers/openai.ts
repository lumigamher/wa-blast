import type OpenAI from "openai";
import type { LlmProvider, LlmResponse } from "./types";

// Los modelos de razonamiento de OpenAI (gpt-5*, o1/o3/o4*) SOLO aceptan
// temperature=1 (el default). Pasar otro valor → 400 "unsupported_value".
// Para esos modelos omitimos el parámetro y dejamos el default de OpenAI.
function supportsCustomTemperature(model: string): boolean {
  return !/^(gpt-5|o1|o3|o4)/i.test(model);
}

export function makeOpenAiProvider(client: OpenAI): LlmProvider {
  return {
    async chat(input): Promise<LlmResponse> {
      const res = await client.chat.completions.create({
        model: input.model,
        ...(supportsCustomTemperature(input.model)
          ? { temperature: input.temperature }
          : {}),
        messages: [
          { role: "system", content: input.system },
          ...input.messages.map((m) => {
            if (m.role === "tool")
              return { role: "tool" as const, tool_call_id: m.toolCallId, content: m.content };
            if (m.role === "assistant")
              return {
                role: "assistant" as const,
                content: m.content,
                tool_calls: m.toolCalls?.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: c.argsJson },
                })),
              };
            return { role: "user" as const, content: m.content };
          }),
        ] as never,
        tools: input.tools.map((t) => ({
          type: "function" as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })) as never,
      });
      const msg = res.choices[0]?.message;
      const toolCalls =
        msg?.tool_calls?.map((c) => {
          const fc = c as {
            id: string;
            function: { name: string; arguments: string };
          };
          return {
            id: fc.id,
            name: fc.function.name,
            argsJson: fc.function.arguments,
          };
        }) ?? [];
      return {
        text: msg?.content ?? null,
        toolCalls,
        usage: {
          promptTokens: res.usage?.prompt_tokens ?? 0,
          completionTokens: res.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}
