import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { messages, orders } from "@/lib/db/schema";

export async function lastInboundMediaId(
  db: DB,
  conversationId: string,
): Promise<string | null> {
  const row = (
    await db
      .select({ mediaId: messages.mediaId })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.direction, "in"),
          isNotNull(messages.mediaId),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1)
  )[0];
  return row?.mediaId ?? null;
}

export async function registrarPago(
  db: DB,
  input: { orgId: string; conversationId: string; orderId?: string; medioDePago: string },
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  let orderId = input.orderId;
  if (!orderId) {
    const o = (
      await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.orgId, input.orgId),
            eq(orders.conversationId, input.conversationId),
            eq(orders.status, "pendiente"),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(1)
    )[0];
    if (!o) return { ok: false, error: "No hay un pedido pendiente en esta conversación" };
    orderId = o.id;
  }
  const comprobanteMediaId = await lastInboundMediaId(db, input.conversationId);
  await db
    .update(orders)
    .set({ status: "pagado", paymentMethod: input.medioDePago, comprobanteMediaId })
    .where(and(eq(orders.id, orderId), eq(orders.orgId, input.orgId)));
  return { ok: true, orderId };
}
