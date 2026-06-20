import { z } from "zod";
import type { AgentTool } from "../types";

const schema = z.object({ motivo: z.string().min(1) });

export const escalarHumano: AgentTool = {
  name: "escalar_a_humano",
  description:
    "Escala la conversación a un humano cuando el cliente lo pide o el tema sale de tu alcance. Tras llamarla, deja de responder.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { motivo: { type: "string" } },
    required: ["motivo"],
  },
  async run(args) {
    const { motivo } = schema.parse(args);
    return { ok: true, data: { escalado: true, motivo } };
  },
};
