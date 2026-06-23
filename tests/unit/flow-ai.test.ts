import { describe, expect, it, test, vi } from "vitest";
import { extractFlowJson, generateFlowJson } from "@/lib/flow-ai";

describe("extractFlowJson", () => {
  test("extracts from fenced block", () => {
    const out = extractFlowJson('```json\n{"version":"6.3","screens":[]}\n```');
    expect(JSON.parse(out).version).toBe("6.3");
  });
  test("extracts from prose-wrapped json", () => {
    const out = extractFlowJson('Aquí tienes:\n{"version":"6.3","screens":[]}\nListo.');
    expect(JSON.parse(out).version).toBe("6.3");
  });
  test("passes through clean json", () => {
    expect(JSON.parse(extractFlowJson('{"version":"6.3","screens":[]}')).screens).toEqual([]);
  });
  test("throws on no json", () => {
    expect(() => extractFlowJson("no hay json aquí")).toThrow();
  });
});

describe("generateFlowJson", () => {
  it("usa el provider del gateway y extrae el JSON", async () => {
    const fakeProvider = {
      chat: vi.fn().mockResolvedValue({
        text: '{"version":"6.3","screens":[]}',
        toolCalls: [],
        usage: { promptTokens: 1, completionTokens: 1 },
      }),
    };
    const out = await generateFlowJson("captura nombre y teléfono", {
      provider: fakeProvider as never,
      model: "gpt-5-mini",
    });
    expect(JSON.parse(out).version).toBe("6.3");
    expect(fakeProvider.chat).toHaveBeenCalledOnce();
  });
});
