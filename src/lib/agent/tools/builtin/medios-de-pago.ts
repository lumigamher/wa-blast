import { z } from "zod";
import { listPaymentMethods } from "../../payments/methods";
import type { AgentTool } from "../types";

const schema = z.object({});

export const mediosDePago: AgentTool = {
  name: "medios_de_pago",
  description:
    "Devuelve los medios de pago disponibles (Nequi, Daviplata, Bre-B, transferencia, link) con sus datos. Úsalo para decirle al cliente cómo pagar.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {},
  },
  escalates: false,
  async run(_args, ctx) {
    const metodos = await listPaymentMethods(ctx.db, ctx.orgId, true);
    return {
      ok: true,
      data: {
        metodos: metodos.map((m) => ({
          type: m.type,
          label: m.label,
          details: m.details,
        })),
      },
    };
  },
};
