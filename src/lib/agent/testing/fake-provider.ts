import type { LlmProvider, LlmResponse } from "@/lib/agent/providers/types";

/**
 * Provider de test: devuelve una secuencia predefinida de respuestas, una por
 * llamada a chat(). Permite scriptear tool_calls y la respuesta final sin API real.
 */
export function makeFakeProvider(script: LlmResponse[]): LlmProvider {
  let i = 0;
  return {
    async chat() {
      const res = script[i] ?? {
        text: "",
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0 },
      };
      i += 1;
      return res;
    },
  };
}
