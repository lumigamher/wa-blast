import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { makeAnthropicProvider } from "./anthropic";
import { makeOpenAiProvider } from "./openai";
import type { LlmProvider } from "./types";

function getEnv() {
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
}

export function getProvider(config: { provider: "openai" | "anthropic" }): LlmProvider {
  const env = getEnv();
  if (config.provider === "anthropic") {
    return makeAnthropicProvider(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" }));
  }
  return makeOpenAiProvider(new OpenAI({ apiKey: env.OPENAI_API_KEY ?? "" }));
}
