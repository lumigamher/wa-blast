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
        variantId: z.string().optional(),
      }),
    )
    .min(1),
});

export const crearPedido: AgentTool = {
  name: "crear_pedido",
  description:
    "Crea un pedido con los productos que el cliente confirmó. Tras crearlo, CONFÍRMALE al cliente el número de pedido, el resumen de items y el total, y dile el siguiente paso (pago o envío).",
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
            variantId: { type: "string", description: "ID de la variante elegida (talla/color), si aplica" },
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

      // Build items summary from the resolved items
      const itemsSummary = result.items.map((item) => ({
        nombre: item.nombre,
        ...(item.variantLabel ? { variante: item.variantLabel } : {}),
        cantidad: item.cantidad,
        subtotalCop: item.subtotal,
      }));

      return {
        ok: true,
        data: {
          orderId: result.orderId,
          numero: result.numero,
          items: itemsSummary,
          totalCop: result.totalCop,
          siguientePaso: "coordinar el pago y la entrega",
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  },
};
