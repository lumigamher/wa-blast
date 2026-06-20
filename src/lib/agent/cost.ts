type Usage = { promptTokens: number; completionTokens: number };

// COP por 1k tokens (in/out). Aproximado, conservador. Editable.
const RATES: Record<string, { in: number; out: number }> = {
  openai: { in: 1, out: 4 },
  anthropic: { in: 3, out: 15 },
};

export function estimateCostCop(usage: Usage, provider: string, _model: string): number {
  const rate = RATES[provider] ?? RATES.openai;
  const cop = (usage.promptTokens / 1000) * rate.in + (usage.completionTokens / 1000) * rate.out;
  return Math.round(cop);
}
