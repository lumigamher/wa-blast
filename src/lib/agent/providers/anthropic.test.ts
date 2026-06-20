import { describe, expect, it, vi } from "vitest";
import { makeAnthropicProvider } from "./anthropic";

describe("anthropic provider", () => {
  it("mapea tool_use y usage del response de Anthropic", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "tool_use", id: "tu1", name: "calcular_total", input: { items: [] } },
      ],
      usage: { input_tokens: 20, output_tokens: 9 },
    });
    const provider = makeAnthropicProvider({ messages: { create } } as never);

    const res = await provider.chat({
      system: "s",
      messages: [{ role: "user", content: "hola" }],
      tools: [{ name: "calcular_total", description: "d", parameters: { type: "object" } }],
      temperature: 0,
      model: "claude-haiku-4-5-20251001",
    });

    expect(res.toolCalls).toEqual([
      { id: "tu1", name: "calcular_total", argsJson: JSON.stringify({ items: [] }) },
    ]);
    expect(res.usage).toEqual({ promptTokens: 20, completionTokens: 9 });
  });
});
