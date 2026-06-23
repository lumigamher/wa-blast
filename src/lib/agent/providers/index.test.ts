import { describe, expect, it } from "vitest";
import { CURATED_MODELS } from "./index";

describe("CURATED_MODELS", () => {
  it("tiene modelos para openai y anthropic con ids válidos", () => {
    expect(CURATED_MODELS.openai.length).toBeGreaterThan(0);
    expect(CURATED_MODELS.anthropic.length).toBeGreaterThan(0);
    for (const list of [CURATED_MODELS.openai, CURATED_MODELS.anthropic]) {
      for (const m of list) {
        expect(m.id).toBeTruthy();
        expect(m.label).toBeTruthy();
        expect(["💲", "💲💲", "💲💲💲"]).toContain(m.cost);
      }
    }
  });

  it("incluye el default gpt-5-mini y claude-haiku-4-5", () => {
    expect(CURATED_MODELS.openai.some((m) => m.id === "gpt-5-mini")).toBe(true);
    expect(CURATED_MODELS.anthropic.some((m) => m.id === "claude-haiku-4-5-20251001")).toBe(true);
  });
});
