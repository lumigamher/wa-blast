import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { documentChunks } from "@/lib/db/schema";
import { cosineSimilarity, deserializeEmbedding } from "./vector";

export type RetrievedChunk = { documentId: string; text: string; score: number };

/**
 * Recupera los top-k chunks de la org más similares al queryEmbedding.
 * Coseno en JS sobre los chunks de la org (scoping estricto por orgId).
 */
export async function retrieve(db: DB, orgId: string, queryEmbedding: number[], k: number): Promise<RetrievedChunk[]> {
  const rows = await db
    .select({ documentId: documentChunks.documentId, text: documentChunks.text, embedding: documentChunks.embedding })
    .from(documentChunks)
    .where(eq(documentChunks.orgId, orgId));
  const scored = rows.map((r) => ({
    documentId: r.documentId, text: r.text,
    score: cosineSimilarity(queryEmbedding, deserializeEmbedding(r.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
