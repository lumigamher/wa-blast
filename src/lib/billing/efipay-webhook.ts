import { eq } from "drizzle-orm";
import { applyCharge } from "@/lib/billing/subscription";
import { parseWebhookEvent, verifyWebhookSignature } from "@/lib/billing/efipay";
import { billingCheckouts } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

export async function handleEfipayWebhook(
  db: DB,
  rawBody: string,
  signature: string | null,
  webhookToken: string,
): Promise<{ status: number }> {
  if (!verifyWebhookSignature(rawBody, signature, webhookToken)) return { status: 401 };
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400 };
  }
  const event = parseWebhookEvent(payload);
  if (!event || !event.approved) return { status: 200 };

  const checkout = (await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, event.chargeId)))[0];
  if (!checkout) return { status: 200 }; // ack para evitar reintentos eternos

  const amount = (payload as Record<string, unknown>).amount;
  await applyCharge(db, {
    orgId: checkout.orgId,
    chargeId: event.chargeId,
    source: "efipay",
    amountCop: typeof amount === "number" ? amount : undefined,
  });
  return { status: 200 };
}
