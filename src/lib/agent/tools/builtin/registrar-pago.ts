import { z } from "zod";
import { registrarPago as registrarPagoFn } from "../../payments/register";
import type { AgentTool } from "../types";

const schema = z.object({
  medioDePago: z.string().min(1),
  orderId: z.string().optional(),
});

export const registrarPago: AgentTool = {
  name: "registrar_pago",
  description:
    "Registra el pago de un pedido cuando el cliente confirma que pagó (idealmente tras enviar el comprobante por foto). Enlaza la última imagen como comprobante.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      medioDePago: { type: "string" },
      orderId: { type: "string" },
    },
    required: ["medioDePago"],
  },
  escalates: false,
  async run(args, ctx) {
    const { medioDePago, orderId } = schema.parse(args);

    const r = await registrarPagoFn(ctx.db, {
      orgId: ctx.orgId,
      conversationId: ctx.conversationId,
      orderId,
      medioDePago,
    });

    if (r.ok) {
      return { ok: true, data: { orderId: r.orderId } };
    } else {
      return { ok: false, error: r.error };
    }
  },
};
