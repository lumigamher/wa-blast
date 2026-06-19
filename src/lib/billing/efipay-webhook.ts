import { inArray } from "drizzle-orm";
import {
  parseWebhookEvent,
  verifyWebhookSignature,
} from "@/lib/billing/efipay";
import { applyCharge, setPlan } from "@/lib/billing/subscription";
import type { DB } from "@/lib/db/client";
import { billingCheckouts } from "@/lib/db/schema";

export async function handleEfipayWebhook(
  db: DB,
  rawBody: string,
  signature: string | null,
  webhookToken: string,
): Promise<{ status: number }> {
  if (!verifyWebhookSignature(rawBody, signature, webhookToken))
    return { status: 401 };
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400 };
  }
  const event = parseWebhookEvent(payload);
  if (!event || !event.approved) return { status: 200 };

  // Try to find checkout by any of the candidate IDs
  let checkout: typeof billingCheckouts.$inferSelect | undefined;
  if (event.candidateIds.length > 0) {
    const results = await db
      .select()
      .from(billingCheckouts)
      .where(inArray(billingCheckouts.id, event.candidateIds));
    checkout = results[0];
  }

  if (!checkout) return { status: 200 }; // ack para evitar reintentos eternos

  // Extract amount from nested or flat payload
  let amount: number | undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.transaction === "object" && p.transaction !== null) {
    const tx = p.transaction as Record<string, unknown>;
    amount = typeof tx.amount === "number" ? tx.amount : undefined;
  } else {
    amount = typeof p.amount === "number" ? p.amount : undefined;
  }

  const chargeId = `efipay_${event.chargeId}`;

  if (checkout.kind === "upgrade") {
    await setPlan(db, {
      orgId: checkout.orgId,
      planId: checkout.planId,
      chargeId,
      source: "efipay",
      amountCop: amount,
    });
  } else {
    await applyCharge(db, {
      orgId: checkout.orgId,
      chargeId,
      source: "efipay",
      amountCop: amount,
      planId: checkout.planId,
    });
  }

  return { status: 200 };
}
