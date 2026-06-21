import { describe, expect, it } from "vitest";
import { estimateCostCop, estimateEmbeddingCostCop } from "./cost";

describe("estimateCostCop", () => {
  it("estima > 0 según tokens y es determinístico", () => {
    const a = estimateCostCop({ promptTokens: 1000, completionTokens: 500 }, "openai", "gpt-5-mini");
    expect(a).toBeGreaterThan(0);
    expect(estimateCostCop({ promptTokens: 1000, completionTokens: 500 }, "openai", "gpt-5-mini")).toBe(a);
  });
  it("0 tokens → 0", () => {
    expect(estimateCostCop({ promptTokens: 0, completionTokens: 0 }, "anthropic", "x")).toBe(0);
  });

  it("estima el costo de embeddings (COP por 1k tokens)", () => {
    const cop = estimateEmbeddingCostCop(1000);
    expect(cop).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(cop)).toBe(true);
  });
});
