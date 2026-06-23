import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { makeAnthropicProvider } from "./anthropic";
import { makeOpenAiProvider } from "./openai";
import type { LlmProvider } from "./types";

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

function getEnv() {
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
}

export function getProvider(config: { provider: "openai" | "anthropic" }): LlmProvider {
  const env = getEnv();
  if (config.provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY)
      throw new Error("ANTHROPIC_API_KEY no configurada");
    return makeAnthropicProvider(
      new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
    );
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
  return makeOpenAiProvider(new OpenAI({ apiKey: env.OPENAI_API_KEY }));
}
