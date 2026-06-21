import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentDocuments, documentChunks } from "@/lib/db/schema";
import { countChunks, countDocuments } from "./admin";
import { chunkText } from "./chunk";
import type { EmbeddingProvider } from "./embeddings/types";
import { RAG_LIMITS } from "./limits";
import { serializeEmbedding } from "./vector";

export type IngestInput = {
  name: string; text: string; source?: "upload" | "text"; mediaAssetId?: string | null; bytes?: number;
};
export type IngestDeps = { embeddings: EmbeddingProvider; limits?: { maxDocsPerOrg?: number; maxBytesPerDoc?: number; maxChunksPerOrg?: number } };

export async function ingestDocument(db: DB, orgId: string, input: IngestInput, deps: IngestDeps): Promise<{ documentId: string; chunkCount: number }> {
  const limits = { ...RAG_LIMITS, ...deps.limits };
  const text = input.text.trim();
  if (!text) throw new Error("El documento está vacío.");

  const bytes = input.bytes ?? Buffer.byteLength(input.text, "utf8");
  if (bytes > limits.maxBytesPerDoc) {
    throw new Error(`El documento supera el máximo de ${Math.round(limits.maxBytesPerDoc / 1024 / 1024)} MB.`);
  }
  if ((await countDocuments(db, orgId)) >= limits.maxDocsPerOrg) {
    throw new Error(`Alcanzaste el límite de ${limits.maxDocsPerOrg} documentos. Borra alguno para subir otro.`);
  }

  const pieces = chunkText(text);
  if (pieces.length === 0) throw new Error("El documento está vacío.");

  const existingChunks = await countChunks(db, orgId);
  if (existingChunks + pieces.length > limits.maxChunksPerOrg) {
    throw new Error(`El documento excede el límite de ${limits.maxChunksPerOrg} fragmentos de la base. Borra documentos o reduce el tamaño.`);
  }

  const documentId = randomUUID();
  const now = new Date();
  await db.insert(agentDocuments).values({
    id: documentId, orgId, name: input.name, source: input.source ?? "text",
    mediaAssetId: input.mediaAssetId ?? null, status: "indexando", chunkCount: 0, bytes,
    embedModel: deps.embeddings.model, createdAt: now,
  });

  try {
    const vectors = await deps.embeddings.embed(pieces);
    await db.insert(documentChunks).values(
      pieces.map((piece, i) => ({
        id: randomUUID(), orgId, documentId, idx: i, text: piece,
        embedding: serializeEmbedding(vectors[i]), createdAt: now,
      })),
    );
    await db.update(agentDocuments).set({ status: "listo", chunkCount: pieces.length }).where(eq(agentDocuments.id, documentId));
    return { documentId, chunkCount: pieces.length };
  } catch (e) {
    await db.update(agentDocuments).set({ status: "error", errorMessage: e instanceof Error ? e.message : "error al indexar" }).where(eq(agentDocuments.id, documentId));
    throw e;
  }
}
