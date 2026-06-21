import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("texto vacío → sin chunks", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });
  it("texto corto → un solo chunk normalizado", () => {
    expect(chunkText("Hola   mundo\n\n")).toEqual(["Hola mundo"]);
  });
  it("texto largo → varios chunks que respetan maxChars", () => {
    const text = "a ".repeat(3000);
    const out = chunkText(text, { maxChars: 2000, overlapChars: 200 });
    expect(out.length).toBeGreaterThan(2);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(2000);
  });
  it("aplica solape entre chunks consecutivos", () => {
    const text = Array.from({ length: 500 }, (_, i) => `palabra${i}`).join(" ");
    const out = chunkText(text, { maxChars: 1000, overlapChars: 200 });
    expect(out.length).toBeGreaterThan(1);
    const tail0 = out[0].slice(-50);
    expect(out[1]).toContain(tail0.trim().split(" ").pop() as string);
  });
});
