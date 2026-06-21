import type OpenAI from "openai";
import type { EmbeddingProvider } from "./types";

const MODEL = "text-embedding-3-small";
const DIMS = 1536;

export function makeOpenAiEmbeddingProvider(client: OpenAI): EmbeddingProvider {
  return {
    model: MODEL,
    dims: DIMS,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const res = await client.embeddings.create({ model: MODEL, input: texts });
      return [...res.data]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding as number[]);
    },
  };
}
