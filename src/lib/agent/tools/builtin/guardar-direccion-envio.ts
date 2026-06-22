import { z } from "zod";
import { getLatestOrderForConversation, setOrderShipping } from "@/lib/agent/catalog/orders";
import type { AgentTool } from "../types";

const schema = z.object({
  destinatario: z.string().min(1),
  telefono: z.string().min(1),
  departamento: z.string().min(1),
  ciudad: z.string().min(1),
  direccion: z.string().min(1),
  barrio: z.string().optional(),
  indicaciones: z.string().optional(),
  transportadora: z.string().optional(),
  precioEnvioCop: z.number().optional(),
  diasEntrega: z.number().optional(),
});

export const guardarDireccionEnvio: AgentTool = {
  name: "guardar_direccion_envio",
  description:
    "Guarda la dirección de despacho del pedido (destinatario, teléfono, departamento, ciudad, dirección, barrio) y la opción de envío elegida. Úsala cuando el cliente confirme a dónde enviar.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      destinatario: { type: "string" },
      telefono: { type: "string" },
      departamento: { type: "string" },
      ciudad: { type: "string" },
      direccion: { type: "string" },
      barrio: { type: "string" },
      indicaciones: { type: "string" },
      transportadora: { type: "string" },
      precioEnvioCop: { type: "number" },
      diasEntrega: { type: "number" },
    },
    required: ["destinatario", "telefono", "departamento", "ciudad", "direccion"],
  },
  escalates: false,
  async run(args, ctx) {
    const a = schema.parse(args);
    const order = await getLatestOrderForConversation(ctx.db, ctx.orgId, ctx.conversationId);
    if (!order)
      return { ok: false, error: "No hay un pedido para asociar la dirección" };
    const address = {
      destinatario: a.destinatario,
      telefono: a.telefono,
      departamento: a.departamento,
      ciudad: a.ciudad,
      direccion: a.direccion,
      barrio: a.barrio ?? null,
      indicaciones: a.indicaciones ?? null,
    };
    const quote = a.transportadora
      ? {
          carrier: a.transportadora,
          priceCop: a.precioEnvioCop ?? null,
          deliveryDays: a.diasEntrega ?? null,
        }
      : undefined;
    await setOrderShipping(ctx.db, ctx.orgId, order.id, {
      addressJson: JSON.stringify(address),
      quoteJson: quote ? JSON.stringify(quote) : undefined,
    });
    return { ok: true, data: { guardado: true } };
  },
};
