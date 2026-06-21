import type { DB } from "@/lib/db/client";
import { orgHasDocuments } from "./admin";
import type { EmbeddingProvider } from "./embeddings/types";
import { retrieve } from "./retrieve";

export { ingestDocument } from "./ingest";
export { listDocuments, deleteDocument, countDocuments, orgHasDocuments } from "./admin";

const DEFAULT_K = 5;
const DEFAULT_MAX_CHARS = 4000;

/** Une los chunks recuperados en un bloque, respetando un tope de caracteres. */
export function buildKnowledgeBlock(chunks: { text: string }[], maxChars = DEFAULT_MAX_CHARS): string {
  let out = "";
  for (const c of chunks) {
    const piece = c.text.trim();
    const addition = out ? `\n---\n${piece}` : piece;
    if (out.length + addition.length > maxChars) break;
    out += addition;
  }
  return out;
}

/**
 * Auto-RAG: embebe la consulta del cliente, recupera top-k chunks de la org
 * y devuelve un bloque de texto listo para inyectar al system prompt.
 * Si la org no tiene documentos o la query está vacía → '' (no gasta embeddings).
 */
export async function retrieveKnowledge(
  db: DB, orgId: string, query: string,
  deps: { embeddings: EmbeddingProvider },
  opts: { k?: number; maxChars?: number } = {},
): Promise<string> {
  if (!query.trim()) return "";
  if (!(await orgHasDocuments(db, orgId))) return "";
  const [queryEmbedding] = await deps.embeddings.embed([query]);
  const chunks = await retrieve(db, orgId, queryEmbedding, opts.k ?? DEFAULT_K);
  return buildKnowledgeBlock(chunks, opts.maxChars ?? DEFAULT_MAX_CHARS);
}
