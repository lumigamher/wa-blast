import { z } from "zod";
import type { AgentTool } from "../types";

const schema = z.object({
  items: z
    .array(
      z.object({
        nombre: z.string().min(1),
        cantidad: z.number().positive(),
        precioUnitario: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export const calcularTotal: AgentTool = {
  name: "calcular_total",
  description:
    "Calcula el total de una lista de items (cantidad x precio unitario). Úsalo SIEMPRE para sumar; nunca calcules tú.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string" },
            cantidad: { type: "number" },
            precioUnitario: { type: "number" },
          },
          required: ["nombre", "cantidad", "precioUnitario"],
        },
      },
    },
    required: ["items"],
  },
  async run(args) {
    const { items } = schema.parse(args);
    const desglose = items.map((i) => ({
      ...i,
      subtotal: i.cantidad * i.precioUnitario,
    }));
    const total = desglose.reduce((s, i) => s + i.subtotal, 0);
    return { ok: true, data: { total, desglose } };
  },
};
