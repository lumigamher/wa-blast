import { describe, expect, it, vi } from "vitest";
import { makeOpenAiEmbeddingProvider } from "./openai";

describe("makeOpenAiEmbeddingProvider", () => {
  it("mapea la respuesta del SDK a number[][] en orden", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [
        { index: 0, embedding: [0.1, 0.2] },
        { index: 1, embedding: [0.3, 0.4] },
      ],
    });
    const client = { embeddings: { create } } as never;
    const provider = makeOpenAiEmbeddingProvider(client);
    const out = await provider.embed(["hola", "mundo"]);
    expect(out).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(create).toHaveBeenCalledWith({ model: "text-embedding-3-small", input: ["hola", "mundo"] });
    expect(provider.model).toBe("text-embedding-3-small");
    expect(provider.dims).toBe(1536);
  });
  it("respeta el orden aunque el SDK devuelva index desordenado", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [
        { index: 1, embedding: [9, 9] },
        { index: 0, embedding: [1, 1] },
      ],
    });
    const client = { embeddings: { create } } as never;
    const provider = makeOpenAiEmbeddingProvider(client);
    expect(await provider.embed(["a", "b"])).toEqual([[1, 1], [9, 9]]);
  });
});
