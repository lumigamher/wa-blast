import { z } from "zod";
import { getCatalogConfig } from "../../integrations/catalog/config";
import { getCatalogProvider } from "../../integrations/catalog/index";
import type { AgentTool } from "../types";

const schema = z.object({
  query: z.string().min(1),
});

export const buscarProducto: AgentTool = {
  name: "buscar_producto",
  description:
    "Busca productos en el catálogo por nombre. Úsalo cuando el cliente pregunta por productos o precios.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  },
  escalates: false,
  async run(args, ctx) {
    const { query } = schema.parse(args);

    const cfg = await getCatalogConfig(ctx.db, ctx.orgId);
    if (!cfg) {
      return { ok: false, error: "Catálogo no configurado" };
    }

    const provider = getCatalogProvider({
      provider: cfg.provider,
      db: ctx.db,
      orgId: ctx.orgId,
      credentials: cfg.credentials,
      config: cfg.config,
    });

    const productos = await provider.search({ query, limit: 10 });

    return { ok: true, data: { productos } };
  },
};
