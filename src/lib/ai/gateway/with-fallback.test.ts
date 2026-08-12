import { describe, expect, it } from "vitest";
import type { LlmProvider, LlmResponse } from "@/lib/agent/providers/types";
import { withFallbackModel } from "./with-fallback";

const OK: LlmResponse = {
  text: "listo",
  toolCalls: [],
  usage: { promptTokens: 1, completionTokens: 1 },
};

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

/** Provider falso que responde según el modelo que le pidan. */
function providerThatFails(failFor: string, error: Error): LlmProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async chat(input) {
      calls.push(input.model);
      if (input.model === failFor) throw error;
      return OK;
    },
  };
}

const INPUT = {
  system: "s",
  messages: [{ role: "user" as const, content: "hola" }],
  tools: [],
  temperature: 0,
  model: "nvidia/nemotron-3.5-lightning:free",
};

describe("withFallbackModel", () => {
  it("reintenta con el modelo de respaldo cuando el gratuito se rate-limitea", async () => {
    const inner = providerThatFails(INPUT.model, httpError(429));
    const p = withFallbackModel(inner, "nvidia/nemotron-3.5-lightning");
    const res = await p.chat(INPUT);
    expect(res).toEqual(OK);
    expect(inner.calls).toEqual([INPUT.model, "nvidia/nemotron-3.5-lightning"]);
  });

  it("reintenta ante el 404 'Provider returned error' de OpenRouter", async () => {
    const inner = providerThatFails(INPUT.model, httpError(404));
    const p = withFallbackModel(inner, "respaldo");
    await p.chat(INPUT);
    expect(inner.calls).toEqual([INPUT.model, "respaldo"]);
  });

  it("reintenta cuando el proveedor devuelve un 5xx", async () => {
    const inner = providerThatFails(INPUT.model, httpError(503));
    const p = withFallbackModel(inner, "respaldo");
    await p.chat(INPUT);
    expect(inner.calls).toEqual([INPUT.model, "respaldo"]);
  });

  it("no reintenta ante un error de la petición (400) — el respaldo fallaría igual", async () => {
    const inner = providerThatFails(INPUT.model, httpError(400));
    const p = withFallbackModel(inner, "respaldo");
    await expect(p.chat(INPUT)).rejects.toThrow(/400/);
    expect(inner.calls).toEqual([INPUT.model]);
  });

  it("no reintenta si la key es inválida (401)", async () => {
    const inner = providerThatFails(INPUT.model, httpError(401));
    const p = withFallbackModel(inner, "respaldo");
    await expect(p.chat(INPUT)).rejects.toThrow(/401/);
    expect(inner.calls).toEqual([INPUT.model]);
  });

  it("propaga el error del respaldo si ese también falla", async () => {
    const inner: LlmProvider = {
      async chat() {
        throw httpError(429);
      },
    };
    const p = withFallbackModel(inner, "respaldo");
    await expect(p.chat(INPUT)).rejects.toThrow(/429/);
  });

  it("devuelve el provider intacto si no hay respaldo configurado", () => {
    const inner: LlmProvider = { async chat() { return OK; } };
    expect(withFallbackModel(inner, null)).toBe(inner);
    expect(withFallbackModel(inner, "")).toBe(inner);
  });

  it("no toca la llamada cuando el modelo primario responde bien", async () => {
    const inner = providerThatFails("ninguno", httpError(429));
    const p = withFallbackModel(inner, "respaldo");
    await p.chat(INPUT);
    expect(inner.calls).toEqual([INPUT.model]);
  });
});
