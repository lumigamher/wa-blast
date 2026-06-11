import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckout, verifyWebhookSignature, parseWebhookEvent } from "@/lib/billing/efipay";

afterEach(() => vi.restoreAllMocks());

describe("efipay client", () => {
  it("createCheckout llama generate-payment con Bearer y devuelve url+id", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          checkout_url: "https://checkout.efipay.co/pay/x",
          transaction_id: "txn_9",
        }),
        { status: 200 },
      ),
    );
    const r = await createCheckout(
      { apiToken: "tok", officeId: "of1", baseUrl: "https://api.test" },
      {
        amountCop: 250000,
        description: "Suscripción wa-blast",
        webhookUrl: "https://luladev.com/api/webhook/efipay",
      },
    );
    expect(r.checkoutUrl).toBe("https://checkout.efipay.co/pay/x");
    expect(r.transactionId).toBe("txn_9");
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe("https://api.test/payment/generate-payment");
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(init?.body));
    expect(body.amount).toBe(250000);
    expect(body.currency_type).toBe("COP");
    expect(body.checkout_type).toBe("redirect");
  });

  it("createCheckout lanza error claro en non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 }),
    );
    await expect(
      createCheckout(
        { apiToken: "bad", officeId: "of1", baseUrl: "https://api.test" },
        { amountCop: 1000, description: "x", webhookUrl: "https://x/wh" },
      ),
    ).rejects.toThrow(/EfiPay 401/);
  });

  it("verifyWebhookSignature valida HMAC-SHA256 del raw body", () => {
    const raw = JSON.stringify({ transaction_id: "t1", status: "approved" });
    const sig = createHmac("sha256", "whtoken")
      .update(raw)
      .digest("hex");
    expect(verifyWebhookSignature(raw, sig, "whtoken")).toBe(true);
    expect(verifyWebhookSignature(raw, "deadbeef", "whtoken")).toBe(false);
    expect(verifyWebhookSignature(raw, null, "whtoken")).toBe(false);
  });

  it("parseWebhookEvent extrae chargeId y si es aprobado", () => {
    expect(parseWebhookEvent({ transaction_id: "t1", status: "approved" })).toEqual({
      chargeId: "t1",
      approved: true,
    });
    expect(
      parseWebhookEvent({ transaction_id: "t2", event: "renew", status: "active" })
        ?.approved,
    ).toBe(true);
    const bad = parseWebhookEvent({ status: "rejected", transaction_id: "t3" });
    expect(bad?.approved).toBe(false);
    expect(parseWebhookEvent({})).toBeNull();
    expect(parseWebhookEvent(null)).toBeNull();
  });
});
