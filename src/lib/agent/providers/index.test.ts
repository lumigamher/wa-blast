import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getProvider } from "./index";

describe("getProvider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("devuelve un LlmProvider con método chat según el provider", () => {
    const p = getProvider({ provider: "openai" });
    expect(typeof p.chat).toBe("function");
    const a = getProvider({ provider: "anthropic" });
    expect(typeof a.chat).toBe("function");
  });
});
