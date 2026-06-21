import { and, desc, eq } from "drizzle-orm";
import { createCheckout, efipayCredsFromEnv } from "@/lib/billing/efipay";
import type { DB } from "@/lib/db/client";
import { orderPayments, orders } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function generarLinkPago(
  db: DB,
  input: { orgId: string; conversationId: string; orderId?: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const order = input.orderId
    ? (await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.orgId, input.orgId))))[0]
    : (
        await db
          .select()
          .from(orders)
          .where(and(eq(orders.orgId, input.orgId), eq(orders.conversationId, input.conversationId), eq(orders.status, "pendiente")))
          .orderBy(desc(orders.createdAt))
          .limit(1)
      )[0];
  if (!order) return { ok: false, error: "No hay un pedido para cobrar" };

  const creds = efipayCredsFromEnv();
  if (!creds) return { ok: false, error: "Pagos en línea no configurados" };

  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;
  try {
    const res = await createCheckout(creds, {
      amountCop: order.totalCop,
      description: `Pedido ${order.id.slice(0, 8)}`,
      webhookUrl: `${base}/api/webhook/efipay`,
      returnUrl: `${base}/`,
      reference: order.id,
    });
    await db.insert(orderPayments).values({ id: res.transactionId, orgId: input.orgId, orderId: order.id, amountCop: order.totalCop, createdAt: new Date() });
    return { ok: true, url: res.checkoutUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error creando el link" };
  }
}

export async function markOrderPaidByCheckout(db: DB, candidateIds: string[]): Promise<boolean> {
  for (const id of candidateIds) {
    const op = (await db.select().from(orderPayments).where(eq(orderPayments.id, id)))[0];
    if (op) {
      await db.update(orders).set({ status: "pagado", paymentMethod: "EfiPay" }).where(eq(orders.id, op.orderId));
      return true;
    }
  }
  return false;
}
