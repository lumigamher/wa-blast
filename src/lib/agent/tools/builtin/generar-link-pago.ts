import { z } from "zod";
import { generarLinkPago } from "../../payments/link";
import type { AgentTool } from "../types";

const schema = z.object({
  orderId: z.string().optional(),
});

export const generarLinkPagoTool: AgentTool = {
  name: "generar_link_pago",
  description: "Genera un link de pago en línea con el total del pedido (pasarela). Devuélvelo para enviárselo al cliente.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      orderId: { type: "string" },
    },
  },
  escalates: false,
  async run(args, ctx) {
    const { orderId } = schema.parse(args);

    const result = await generarLinkPago(ctx.db, {
      orgId: ctx.orgId,
      conversationId: ctx.conversationId,
      orderId,
    });

    if (result.ok) {
      return { ok: true, data: { url: result.url } };
    } else {
      return { ok: false, error: result.error };
    }
  },
};
