import type { EmbeddingProvider } from "../embeddings/types";

/**
 * EmbeddingProvider falso y determinístico para tests.
 * Mapea cada texto a un vector pequeño basado en presencia de palabras clave,
 * de modo que textos similares produzcan vectores cercanos.
 */
export function makeFakeEmbeddings(
  vocab: string[] = ["menu", "precio", "horario", "envio", "pago"],
): EmbeddingProvider {
  return {
    model: "fake-embeddings",
    dims: vocab.length,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((t) => {
        const low = t.toLowerCase();
        return vocab.map((w) => (low.includes(w) ? 1 : 0));
      });
    },
  };
}
