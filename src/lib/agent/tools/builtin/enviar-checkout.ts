import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { conversations, orders } from "@/lib/db/schema";
import { getAgentConfig } from "@/lib/agent/config";
import { getOrgSettings } from "@/lib/org/settings";
import { sendText, sendFlow } from "@/lib/meta/client";
import { buildOrderSummaryText } from "@/lib/agent/payments/summary";
import type { AgentTool } from "../types";

const schema = z.object({
  orderId: z.string().optional(),
});

export const enviarCheckout: AgentTool = {
  name: "enviar_checkout",
  description:
    "Envía al cliente el resumen del pedido y el formulario de checkout (Flow) para elegir medio de pago y datos de entrega. Úsalo cuando el cliente confirma el pedido.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      orderId: {
        type: "string",
      },
    },
  },
  escalates: false,
  async run(args, ctx) {
    const { orderId } = schema.parse(args);

    // Resolve order
    let order;
    if (orderId) {
      const [row] = await ctx.db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));
      order = row;
    } else {
      // Get latest pending order for this conversation
      const [row] = await ctx.db
        .select()
        .from(orders)
        .where(eq(orders.conversationId, ctx.conversationId))
        .orderBy(desc(orders.createdAt))
        .limit(1);
      order = row;
    }

    if (!order || order.status !== "pendiente") {
      return { ok: false, error: "No hay un pedido para enviar" };
    }

    // Get agent config
    const config = await getAgentConfig(ctx.db, ctx.orgId);
    if (!config.checkoutFlowId) {
      return { ok: false, error: "No hay Flow de checkout configurado" };
    }

    // Get org settings
    const settings = await getOrgSettings(ctx.db, ctx.orgId);

    // Get conversation phone
    const [conv] = await ctx.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, ctx.conversationId));

    if (!conv?.phone) {
      return { ok: false, error: "Conversación sin teléfono" };
    }

    // Send text with order summary
    const textResult = await sendText(settings, {
      to: conv.phone,
      body: buildOrderSummaryText(order),
    });

    if ("error" in textResult) {
      return { ok: false, error: textResult.error.message };
    }

    // Send flow
    const flowResult = await sendFlow(settings, {
      to: conv.phone,
      flowId: config.checkoutFlowId,
      cta: "Pagar",
      bodyText: "Completa tu compra",
    });

    if ("error" in flowResult) {
      return { ok: false, error: flowResult.error.message };
    }

    return { ok: true, data: { enviado: true, orderId: order.id } };
  },
};
