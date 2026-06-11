import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { billingCheckouts, organization } from "@/lib/db/schema";
import { getSubscription } from "@/lib/billing/subscription";
import { handleEfipayWebhook } from "@/lib/billing/efipay-webhook";
import type { DB } from "@/lib/db/client";

function signed(body: object, token = "whtoken") {
  const raw = JSON.stringify(body);
  return { raw, sig: createHmac("sha256", token).update(raw).digest("hex") };
}

async function seed(db: DB) {
  await db.insert(organization).values({ id: "org1", name: "o", slug: "o", createdAt: new Date() });
  // Real contract stores payment_id from response in billingCheckouts.id
  // Webhook can come with multiple candidate IDs, so we seed both checkout.id and checkout.payment_referenceable_id
  await db.insert(billingCheckouts).values({ id: "019eb540-19f2-7385-b69b-4eb8c6bdf943", orgId: "org1", createdAt: new Date() });
}

describe("efipay webhook handler", () => {
  it("firma inválida → 401 y no activa nada", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload = {
      transaction: { transaction_id: 107, status: "Aprobada" },
      checkout: { id: "019eb540-19f2-7385-b69b-4eb8c6bdf943" },
    };
    const { raw } = signed(payload);
    const res = await handleEfipayWebhook(db, raw, "malasig", "whtoken");
    expect(res.status).toBe(401);
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });

  it("body no-JSON con firma válida → 400", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const raw = "not-json{{";
    const sig = createHmac("sha256", "whtoken").update(raw).digest("hex");
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(400);
  });

  it("pago aprobado con nested shape → extiende paidUntil de la org del checkout", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload = {
      transaction: { transaction_id: 107, amount: 250000, currency_type: "COP", status: "Aprobada" },
      checkout: { id: "019eb540-19f2-7385-b69b-4eb8c6bdf943", payment_referenceable_id: "9af329b7-..." },
    };
    const { raw, sig } = signed(payload);
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(200);
    expect((await getSubscription(db, "org1")).status).toBe("active");
  });

  it("checkout match por payment_referenceable_id", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "org2", name: "o2", slug: "o2", createdAt: new Date() });
    // This time, payment_id stored is the payment_referenceable_id
    await db.insert(billingCheckouts).values({ id: "9af329b7-ref", orgId: "org2", createdAt: new Date() });
    const payload = {
      transaction: { transaction_id: 108, amount: 250000, status: "Aprobada" },
      checkout: { id: "other-id", payment_referenceable_id: "9af329b7-ref" },
    };
    const { raw, sig } = signed(payload);
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(200);
    expect((await getSubscription(db, "org2")).status).toBe("active");
  });

  it("mismo webhook dos veces → no extiende doble (idempotency)", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload = {
      transaction: { transaction_id: 107, status: "Aprobada" },
      checkout: { id: "019eb540-19f2-7385-b69b-4eb8c6bdf943" },
    };
    const { raw, sig } = signed(payload);
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    const first = (await getSubscription(db, "org1")).paidUntil!.getTime();
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect((await getSubscription(db, "org1")).paidUntil!.getTime()).toBe(first);
  });

  it("candidateIds desconocidos → 200 (ack) sin efecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload = {
      transaction: { transaction_id: 999, status: "Aprobada" },
      checkout: { id: "unknown-id" },
    };
    const { raw, sig } = signed(payload);
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(200);
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });

  it("status Rechazada → 200 sin efecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload = {
      transaction: { transaction_id: 110, status: "Rechazada" },
      checkout: { id: "019eb540-19f2-7385-b69b-4eb8c6bdf943" },
    };
    const { raw, sig } = signed(payload);
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });

  it("status Pendiente → 200 sin efecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload = {
      transaction: { transaction_id: 111, status: "Pendiente" },
      checkout: { id: "019eb540-19f2-7385-b69b-4eb8c6bdf943" },
    };
    const { raw, sig } = signed(payload);
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });
});
