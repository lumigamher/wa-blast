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
  input: { amountCop: number; description: string; webhookUrl: string },
): Promise<{ checkoutUrl: string; transactionId: string }> {
  const res = await fetch(`${creds.baseUrl}/payment/generate-payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: input.description,
      amount: input.amountCop,
      currency_type: "COP",
      checkout_type: "redirect",
      office: creds.officeId,
      webhook_url: input.webhookUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EfiPay ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const checkoutUrl = String(json.checkout_url ?? "");
  const transactionId = String(json.transaction_id ?? "");

  if (!checkoutUrl || !transactionId) {
    throw new Error("EfiPay: respuesta sin checkout_url/transaction_id");
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

const APPROVED = new Set(["approved", "active", "success", "paid"]);
const APPROVED_EVENTS = new Set(["renew", "renewed"]);

export function parseWebhookEvent(
  payload: unknown,
): { chargeId: string; approved: boolean } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const chargeId = String(p.transaction_id ?? p.transactionId ?? "");
  if (!chargeId) return null;
  const status = String(p.status ?? "").toLowerCase();
  const event = String(p.event ?? "").toLowerCase();
  return {
    chargeId,
    approved: APPROVED.has(status) || APPROVED_EVENTS.has(event),
  };
}
