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
  // El orderId lo pone el LLM (o sea el cliente final): solo vale si el pedido es de
  // esta org Y de esta conversación; si no, se trata como si no existiera.
  const o = (
    await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, input.orgId),
          eq(orders.conversationId, input.conversationId),
          ...(input.orderId ? [eq(orders.id, input.orderId)] : [eq(orders.status, "pendiente")]),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(1)
  )[0];
  if (!o) return { ok: false, error: "No hay un pedido pendiente en esta conversación" };
  const orderId = o.id;
  const comprobanteMediaId = await lastInboundMediaId(db, input.conversationId);
  await db
    .update(orders)
    .set({ status: "pagado", paymentMethod: input.medioDePago, comprobanteMediaId })
    .where(and(eq(orders.id, orderId), eq(orders.orgId, input.orgId), eq(orders.conversationId, input.conversationId)));
  return { ok: true, orderId };
}
