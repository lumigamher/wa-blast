import OpenAI from "openai";
import { makeOpenAiEmbeddingProvider } from "./openai";
import type { EmbeddingProvider } from "./types";

export type { EmbeddingProvider } from "./types";

/** Construye el provider de embeddings por defecto (OpenAI) desde env. */
export function getEmbeddingProvider(): EmbeddingProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada");
  return makeOpenAiEmbeddingProvider(new OpenAI({ apiKey: key }));
}
