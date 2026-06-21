import { describe, expect, it } from "vitest";
import { cosineSimilarity, deserializeEmbedding, serializeEmbedding } from "./vector";

describe("vector", () => {
  it("coseno de vectores idénticos = 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it("coseno de ortogonales = 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("vector cero → 0 (sin NaN)", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it("ordena por similitud (más cercano primero)", () => {
    const q = [1, 0];
    expect(cosineSimilarity(q, [0.9, 0.1])).toBeGreaterThan(cosineSimilarity(q, [0.1, 0.9]));
  });
  it("serialize/deserialize es ida y vuelta", () => {
    const v = [0.1, -0.2, 0.3];
    expect(deserializeEmbedding(serializeEmbedding(v))).toEqual(v);
  });
});
