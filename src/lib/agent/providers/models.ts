// Datos puros de modelos curados. SIN imports de SDK (@anthropic-ai/sdk / openai)
// para que pueda importarse desde client components sin arrastrar código de
// servidor al bundle del navegador.

export type CuratedModel = {
  id: string;
  label: string;
  hint: string;
  cost: "💲" | "💲💲" | "💲💲💲";
};

export const CURATED_MODELS: Record<"openai" | "anthropic", CuratedModel[]> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hint: "Rápido, recomendado para alto volumen", cost: "💲" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "Equilibrado calidad/costo", cost: "💲💲" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", hint: "Máxima calidad", cost: "💲💲💲" },
  ],
  openai: [
    { id: "gpt-5-mini", label: "GPT-5 mini", hint: "Rápido, recomendado", cost: "💲" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", hint: "Mayor capacidad", cost: "💲💲" },
  ],
};
