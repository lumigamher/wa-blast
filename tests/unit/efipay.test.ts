import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckout, verifyWebhookSignature, parseWebhookEvent } from "@/lib/billing/efipay";

afterEach(() => vi.restoreAllMocks());

describe("efipay client", () => {
  it("createCheckout llama generate-payment con Bearer y devuelve url+id", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          saved: true,
          payment_id: "019eb540-19f2-7385-b69b-4eb8c6bdf943",
          url: "https://sag.efipay.co/Checkout/PaymentGateway/019eb540-19f2-7385-b69b-4eb8c6bdf943?signature=...",
        }),
        { status: 200 },
      ),
    );
    const r = await createCheckout(
      { apiToken: "tok", officeId: "4279", baseUrl: "https://api.test" },
      {
        amountCop: 250000,
        description: "Suscripción wa-blast",
        webhookUrl: "https://luladev.com/api/webhook/efipay",
        returnUrl: "https://luladev.com/facturacion/retorno",
        reference: "org123",
      },
    );
    expect(r.checkoutUrl).toBe("https://sag.efipay.co/Checkout/PaymentGateway/019eb540-19f2-7385-b69b-4eb8c6bdf943?signature=...");
    expect(r.transactionId).toBe("019eb540-19f2-7385-b69b-4eb8c6bdf943");
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe("https://api.test/payment/generate-payment");
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer tok");
    expect(headers?.["Content-Type"]).toBe("application/json");
    expect(headers?.Accept).toBe("application/json");
    const body = JSON.parse(String(init?.body));
    expect(body.payment.amount).toBe(250000);
    expect(body.payment.currency_type).toBe("COP");
    expect(body.payment.checkout_type).toBe("redirect");
    expect(body.office).toBe(4279);
    expect(body.advanced_options.references).toEqual(["org123"]);
    expect(body.advanced_options.result_urls.approved).toBe("https://luladev.com/facturacion/retorno");
    expect(body.advanced_options.result_urls.rejected).toBe("https://luladev.com/facturacion/retorno");
    expect(body.advanced_options.result_urls.pending).toBe("https://luladev.com/facturacion/retorno");
    expect(body.advanced_options.result_urls.webhook).toBe("https://luladev.com/api/webhook/efipay");
  });

  it("createCheckout lanza error claro en non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 }),
    );
    await expect(
      createCheckout(
        { apiToken: "bad", officeId: "of1", baseUrl: "https://api.test" },
        { amountCop: 1000, description: "x", webhookUrl: "https://x/wh", returnUrl: "https://x/r", reference: "ref1" },
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

  it("parseWebhookEvent extrae chargeId y si es aprobado (legacy flat shape)", () => {
    expect(parseWebhookEvent({ transaction_id: "t1", status: "approved" })).toEqual({
      chargeId: "t1",
      approved: true,
      candidateIds: ["t1"],
    });
    expect(
      parseWebhookEvent({ transaction_id: "t2", event: "renew", status: "active" })
        ?.approved,
    ).toBe(true);
    const bad = parseWebhookEvent({ status: "rejected", transaction_id: "t3" });
    expect(bad?.approved).toBe(false);
    expect(bad?.chargeId).toBe("t3");
    expect(parseWebhookEvent({})).toBeNull();
    expect(parseWebhookEvent(null)).toBeNull();
  });

  it("parseWebhookEvent maneja nested shape real (transaction/checkout)", () => {
    const nested = {
      transaction: {
        transaction_id: 107,
        amount: 250000,
        currency_type: "COP",
        status: "Aprobada",
      },
      checkout: {
        id: "9af329f1-...",
        payment_referenceable_id: "9af329b7-...",
        payment_gateway_id: "9af329b7-...",
      },
    };
    const event = parseWebhookEvent(nested);
    expect(event?.chargeId).toBe("107");
    expect(event?.approved).toBe(true);
    expect(event?.candidateIds).toContain("107");
    expect(event?.candidateIds).toContain("9af329f1-...");
    expect(event?.candidateIds).toContain("9af329b7-...");
  });

  it("parseWebhookEvent rechaza status no aprobado (rechazada/pendiente)", () => {
    const rejected = parseWebhookEvent({
      transaction: { transaction_id: 5, status: "Rechazada" },
      checkout: { id: "xyz" },
    });
    expect(rejected?.approved).toBe(false);
    expect(rejected?.chargeId).toBe("5");

    const pending = parseWebhookEvent({
      transaction: { transaction_id: 6, status: "Pendiente" },
    });
    expect(pending?.approved).toBe(false);
  });
});
