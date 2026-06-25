import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { conversations } from "@/lib/db/schema";
import { saveContactFacts } from "@/lib/agent/customer/profile";
import type { AgentTool } from "../types";

const schema = z.object({
  campos: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const recopilarDatos: AgentTool = {
  name: "recopilar_datos",
  description:
    "Guarda en la ficha del cliente los datos que proporcione (nombre, ciudad, email, empresa, o cualquier dato útil como preferencias o segmento).",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { campos: { type: "object" } },
    required: ["campos"],
  },
  async run(args, ctx) {
    const { campos } = schema.parse(args);
    const [conv] = await ctx.db
      .select({ contactId: conversations.contactId })
      .from(conversations)
      .where(and(eq(conversations.id, ctx.conversationId), eq(conversations.orgId, ctx.orgId)));
    if (conv?.contactId) await saveContactFacts(ctx.db, ctx.orgId, conv.contactId, campos);
    return { ok: true, data: { guardados: Object.keys(campos) } };
  },
};
