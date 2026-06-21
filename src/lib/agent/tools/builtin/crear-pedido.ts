import { eq } from "drizzle-orm";
import { z } from "zod";
import { conversations } from "@/lib/db/schema";
import { getCatalogConfig } from "../../integrations/catalog/config";
import { getCatalogProvider } from "../../integrations/catalog/index";
import { createOrder } from "../../catalog/orders";
import type { AgentTool } from "../types";

const schema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        cantidad: z.number().positive(),
      }),
    )
    .min(1),
});

export const crearPedido: AgentTool = {
  name: "crear_pedido",
  description:
    "Crea un pedido con los productos elegidos. Confirma con el cliente los productos y cantidades antes de usarla.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            productId: { type: "string" },
            cantidad: { type: "number" },
          },
          required: ["productId", "cantidad"],
        },
      },
    },
    required: ["items"],
  },
  escalates: false,
  async run(args, ctx) {
    const { items } = schema.parse(args);

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

    // Resolve contactId from conversation
    const conv = await ctx.db.select().from(conversations).where(eq(conversations.id, ctx.conversationId)).get();
    const contactId = conv?.contactId ?? undefined;

    try {
      const result = await createOrder(
        ctx.db,
        {
          orgId: ctx.orgId,
          conversationId: ctx.conversationId,
          contactId,
          items,
        },
        provider,
      );

      return { ok: true, data: { orderId: result.orderId, totalCop: result.totalCop } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  },
};
