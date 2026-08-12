import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { DB } from "@/lib/db/client";
import { makeAnthropicProvider } from "@/lib/agent/providers/anthropic";
import { makeGoogleProvider } from "@/lib/agent/providers/google";
import { makeOpenAiProvider } from "@/lib/agent/providers/openai";
import type { LlmProvider } from "@/lib/agent/providers/types";
import { makeOpenAiEmbeddingProvider } from "@/lib/agent/rag/embeddings/openai";
import type { EmbeddingProvider } from "@/lib/agent/rag/embeddings/types";
import { getGatewayConfig } from "./config";
import { withFallbackModel } from "./with-fallback";

export type ChatResolution =
  | { ok: true; provider: LlmProvider; model: string; fallbackModel: string | null }
  | { ok: false; error: string };

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter expone la API de chat completions de OpenAI tal cual, así que
 * reusamos el mismo adaptador. Los headers de atribución son opcionales pero
 * OpenRouter los usa para el ranking público de apps.
 */
export function makeOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://luladev.com",
      "X-Title": "Lula",
    },
  });
}

export async function resolveChatProvider(db: DB, orgId: string): Promise<ChatResolution> {
  const cfg = await getGatewayConfig(db, orgId);
  if (!cfg) return { ok: false, error: "Configura tu modelo y API key en Configuración › IA." };
  if (cfg.chatProvider === "anthropic") {
    if (!cfg.anthropicKey)
      return { ok: false, error: "Falta tu API key de Anthropic. Agrégala en Configuración › IA." };
    return {
      ok: true,
      provider: withFallbackModel(makeAnthropicProvider(new Anthropic({ apiKey: cfg.anthropicKey })), cfg.fallbackModel),
      model: cfg.chatModel,
      fallbackModel: cfg.fallbackModel,
    };
  }
  if (cfg.chatProvider === "google") {
    if (!cfg.googleKey)
      return { ok: false, error: "Falta tu API key de Google. Agrégala en Configuración › IA." };
    return {
      ok: true,
      provider: withFallbackModel(makeGoogleProvider(cfg.googleKey), cfg.fallbackModel),
      model: cfg.chatModel,
      fallbackModel: cfg.fallbackModel,
    };
  }
  if (cfg.chatProvider === "openrouter") {
    if (!cfg.openrouterKey)
      return { ok: false, error: "Falta tu API key de OpenRouter. Agrégala en Configuración › IA." };
    return {
      ok: true,
      provider: withFallbackModel(makeOpenAiProvider(makeOpenRouterClient(cfg.openrouterKey)), cfg.fallbackModel),
      model: cfg.chatModel,
      fallbackModel: cfg.fallbackModel,
    };
  }
  if (cfg.chatProvider === "custom") {
    if (!cfg.customKey || !cfg.customBaseUrl)
      return { ok: false, error: "Falta la URL base o la API key de tu proveedor. Agrégalas en Configuración › IA." };
    return {
      ok: true,
      provider: withFallbackModel(
        makeOpenAiProvider(new OpenAI({ apiKey: cfg.customKey, baseURL: cfg.customBaseUrl })),
        cfg.fallbackModel,
      ),
      model: cfg.chatModel,
      fallbackModel: cfg.fallbackModel,
    };
  }
  if (!cfg.openaiKey) return { ok: false, error: "Falta tu API key de OpenAI. Agrégala en Configuración › IA." };
  return {
    ok: true,
    provider: withFallbackModel(makeOpenAiProvider(new OpenAI({ apiKey: cfg.openaiKey })), cfg.fallbackModel),
    model: cfg.chatModel,
    fallbackModel: cfg.fallbackModel,
  };
}

export async function resolveEmbeddingProvider(db: DB, orgId: string): Promise<EmbeddingProvider | null> {
  const cfg = await getGatewayConfig(db, orgId);
  if (!cfg?.openaiKey) return null;
  return makeOpenAiEmbeddingProvider(new OpenAI({ apiKey: cfg.openaiKey }));
}
