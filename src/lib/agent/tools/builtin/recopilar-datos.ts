import { z } from "zod";
import type { AgentTool } from "../types";

const schema = z.object({
  campos: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const recopilarDatos: AgentTool = {
  name: "recopilar_datos",
  description:
    "Registra datos que el cliente proporcione (nombre, ciudad, etc.) como pares campo:valor.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { campos: { type: "object" } },
    required: ["campos"],
  },
  async run(args) {
    const { campos } = schema.parse(args);
    return { ok: true, data: { recogidos: campos } };
  },
};
