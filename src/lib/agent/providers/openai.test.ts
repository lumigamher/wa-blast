import { describe, expect, it, vi } from "vitest";
import { makeOpenAiProvider } from "./openai";

describe("openai provider", () => {
  it("mapea tool_calls y usage de la respuesta de OpenAI", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "tc1", function: { name: "calcular_total", arguments: '{"items":[]}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 7 },
    });
    const provider = makeOpenAiProvider({
      chat: { completions: { create } },
    } as never);

    const res = await provider.chat({
      system: "s",
      messages: [{ role: "user", content: "hola" }],
      tools: [{ name: "calcular_total", description: "d", parameters: { type: "object" } }],
      temperature: 0,
      model: "gpt-5-mini",
    });

    expect(res.toolCalls).toEqual([
      { id: "tc1", name: "calcular_total", argsJson: '{"items":[]}' },
    ]);
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 7 });
    expect(res.text).toBeNull();
  });
});
