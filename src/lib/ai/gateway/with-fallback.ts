import type { LlmProvider } from "@/lib/agent/providers/types";

/**
 * Los modelos gratuitos de OpenRouter tienen cupo duro (20 req/min y 50–1.000
 * req/día según los créditos comprados). Cuando se agota, la conversación del
 * cliente se quedaría sin respuesta. Este envoltorio reintenta UNA vez con un
 * modelo de respaldo de pago ante fallas transitorias.
 *
 * No reintenta ante 4xx de la petición (400 mal formada, 401/403 key inválida):
 * el respaldo fallaría por lo mismo y solo gastaríamos tiempo y créditos.
 */
function isTransient(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (status == null) return true; // red caída / timeout
  return status === 429 || status >= 500;
}

export function withFallbackModel(provider: LlmProvider, fallbackModel: string | null): LlmProvider {
  if (!fallbackModel) return provider;
  return {
    async chat(input) {
      try {
        return await provider.chat(input);
      } catch (e) {
        if (!isTransient(e)) throw e;
        return provider.chat({ ...input, model: fallbackModel });
      }
    },
  };
}
