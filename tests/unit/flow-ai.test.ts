import { describe, expect, test } from "vitest";
import { extractFlowJson } from "@/lib/flow-ai";

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
