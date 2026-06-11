import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export type EfipayCreds = {
  apiToken: string;
  officeId: string;
  baseUrl: string;
};

export function efipayCredsFromEnv(): EfipayCreds | null {
  if (!env.EFIPAY_API_TOKEN || !env.EFIPAY_OFFICE_ID) return null;
  return {
    apiToken: env.EFIPAY_API_TOKEN,
    officeId: env.EFIPAY_OFFICE_ID,
    baseUrl: env.EFIPAY_BASE_URL,
  };
}

export async function createCheckout(
  creds: EfipayCreds,
  input: { amountCop: number; description: string; webhookUrl: string; returnUrl: string; reference: string },
): Promise<{ checkoutUrl: string; transactionId: string }> {
  const res = await fetch(`${creds.baseUrl}/payment/generate-payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      payment: {
        description: input.description,
        amount: input.amountCop,
        currency_type: "COP",
        checkout_type: "redirect",
      },
      advanced_options: {
        references: [input.reference],
        result_urls: {
          approved: input.returnUrl,
          rejected: input.returnUrl,
          pending: input.returnUrl,
          webhook: input.webhookUrl,
        },
      },
      office: Number(creds.officeId),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EfiPay ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const checkoutUrl = String(json.url ?? "");
  const transactionId = String(json.payment_id ?? "");

  if (!checkoutUrl || !transactionId) {
    const bodyStr = JSON.stringify(json).slice(0, 300);
    throw new Error(`EfiPay: respuesta sin url/payment_id: ${bodyStr}`);
  }

  return { checkoutUrl, transactionId };
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookToken: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", webhookToken)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const APPROVED = new Set(["aprobada", "approved", "active", "success", "paid"]);
const APPROVED_EVENTS = new Set(["renew", "renewed"]);

export type EfipayEvent = { chargeId: string; approved: boolean; candidateIds: string[] };

export function parseWebhookEvent(payload: unknown): EfipayEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  // Handle nested shape (real contract): { transaction: {...}, checkout: {...} }
  // Also handle flat shape (legacy): { transaction_id, status, ... }
  const transaction = typeof p.transaction === "object" && p.transaction !== null
    ? (p.transaction as Record<string, unknown>)
    : p;
  const checkout = typeof p.checkout === "object" && p.checkout !== null
    ? (p.checkout as Record<string, unknown>)
    : null;

  // Extract chargeId
  const transactionId = transaction.transaction_id ?? transaction.transactionId;
  const chargeId = transactionId !== undefined ? String(transactionId) : "";
  if (!chargeId) return null;

  // Extract approved status
  const status = String(transaction.status ?? "").toLowerCase();
  const event = String(transaction.event ?? "").toLowerCase();
  const approved = APPROVED.has(status) || APPROVED_EVENTS.has(event);

  // Build candidateIds: all unique non-empty strings that could identify the checkout in billingCheckouts.id
  const candidateSet = new Set<string>();
  if (chargeId) candidateSet.add(chargeId);
  if (checkout?.id) candidateSet.add(String(checkout.id));
  if (checkout?.payment_referenceable_id) candidateSet.add(String(checkout.payment_referenceable_id));
  if (checkout?.payment_gateway_id) candidateSet.add(String(checkout.payment_gateway_id));

  // Also check for references array in transaction or checkout
  const references = (transaction.references ?? checkout?.references) as unknown[];
  if (Array.isArray(references)) {
    for (const ref of references) {
      if (ref && typeof ref === "object") {
        const refObj = ref as Record<string, unknown>;
        if (refObj.id) candidateSet.add(String(refObj.id));
      } else if (typeof ref === "string" && ref) {
        candidateSet.add(ref);
      }
    }
  }

  const candidateIds = Array.from(candidateSet);

  return { chargeId, approved, candidateIds };
}
