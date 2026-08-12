type Usage = { promptTokens: number; completionTokens: number };

// COP por 1k tokens (in/out). Aproximado, conservador. Editable.
// Claves por "provider:model" (más específico) con fallback al provider.
const RATES: Record<string, { in: number; out: number }> = {
  openai: { in: 1, out: 8 },
  anthropic: { in: 13, out: 62 },
  "anthropic:claude-haiku-4-5-20251001": { in: 4, out: 21 },
  google: { in: 1.3, out: 10.3 },
  openrouter: { in: 1, out: 4 },
  custom: { in: 1, out: 4 },
};

export function estimateCostCop(
  usage: Usage,
  provider: string,
  model: string,
): number {
  // Las variantes ":free" de OpenRouter no cobran tokens: cobrarlas en el
  // tablero haría ver gasto donde no lo hay.
  if (model.endsWith(":free")) return 0;
  const rate = RATES[`${provider}:${model}`] ?? RATES[provider] ?? RATES.openai;
  const cop = (usage.promptTokens / 1000) * rate.in + (usage.completionTokens / 1000) * rate.out;
  return Math.round(cop);
}

// COP por 1k tokens de embeddings (text-embedding-3-small ≈ $0.02/1M tokens).
// Muy barato; tarifa conservadora editable.
const EMBEDDING_RATE_PER_1K = 0.1;

export function estimateEmbeddingCostCop(tokens: number): number {
  return Math.round((tokens / 1000) * EMBEDDING_RATE_PER_1K);
}
