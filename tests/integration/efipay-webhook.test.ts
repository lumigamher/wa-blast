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
  await db.insert(billingCheckouts).values({ id: "txn_1", orgId: "org1", createdAt: new Date() });
}

describe("efipay webhook handler", () => {
  it("firma inválida → 401 y no activa nada", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw } = signed({ transaction_id: "txn_1", status: "approved" });
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

  it("pago aprobado → extiende paidUntil de la org del checkout", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "txn_1", status: "approved", amount: 250000 });
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(200);
    expect((await getSubscription(db, "org1")).status).toBe("active");
  });

  it("mismo webhook dos veces → no extiende doble", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "txn_1", status: "approved" });
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    const first = (await getSubscription(db, "org1")).paidUntil!.getTime();
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect((await getSubscription(db, "org1")).paidUntil!.getTime()).toBe(first);
  });

  it("transaction_id desconocido → 200 (ack) sin efecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "nope", status: "approved" });
    const res = await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect(res.status).toBe(200);
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });

  it("status no aprobado → 200 sin efecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { raw, sig } = signed({ transaction_id: "txn_1", status: "rejected" });
    await handleEfipayWebhook(db, raw, sig, "whtoken");
    expect((await getSubscription(db, "org1")).status).toBe("none");
  });
});
