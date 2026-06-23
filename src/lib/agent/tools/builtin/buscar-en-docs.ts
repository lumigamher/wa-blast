import { z } from "zod";
import { resolveEmbeddingProvider } from "@/lib/ai/gateway/resolve";
import { retrieveKnowledge } from "@/lib/agent/rag";
import type { AgentTool } from "../types";

const schema = z.object({ query: z.string().min(1) });

export const buscarEnDocs: AgentTool = {
  name: "buscar_en_docs",
  description:
    "Busca información en los documentos de la empresa (menú, políticas, FAQ, fichas). Úsalo cuando necesites datos específicos que el cliente pregunta y que pueden estar en la documentación.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Lo que quieres buscar en los documentos" } },
    required: ["query"],
  },
  escalates: false,
  async run(args, ctx) {
    const { query } = schema.parse(args);
    try {
      const embeddings = await resolveEmbeddingProvider(ctx.db, ctx.orgId);
      if (!embeddings) return { ok: false, error: "RAG no disponible: configura tu API key de OpenAI en Configuración › IA." };
      const info = await retrieveKnowledge(ctx.db, ctx.orgId, query, { embeddings });
      return { ok: true, data: { info } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "error buscando en documentos" };
    }
  },
};
