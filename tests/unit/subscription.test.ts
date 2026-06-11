import { describe, expect, it } from "vitest";
import type { DB } from "@/lib/db/client";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { applyCharge, getSubscription, hasActiveSubscription, setSuspended } from "@/lib/billing/subscription";

async function seedOrg(db: DB, id = "org1") {
  await db.insert(organization).values({ id, name: id, createdAt: new Date() });
  return id;
}

describe("subscription ledger", () => {
  it("org sin filas no está activa", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    expect(await hasActiveSubscription(db, orgId)).toBe(false);
    expect((await getSubscription(db, orgId)).status).toBe("none");
  });

  it("applyCharge activa y extiende 30 días desde ahora", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    const r = await applyCharge(db, { orgId, chargeId: "txn_1", source: "efipay", amountCop: 250000 });
    expect(r.applied).toBe(true);
    expect(await hasActiveSubscription(db, orgId)).toBe(true);
    const days = (r.paidUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("cargos se acumulan desde paidUntil vigente (no desde hoy)", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    await applyCharge(db, { orgId, chargeId: "a", source: "manual" });
    const r2 = await applyCharge(db, { orgId, chargeId: "b", source: "manual" });
    const days = (r2.paidUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(59);
  });

  it("mismo chargeId dos veces NO extiende doble (idempotencia)", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    const r1 = await applyCharge(db, { orgId, chargeId: "dup", source: "efipay" });
    const r2 = await applyCharge(db, { orgId, chargeId: "dup", source: "efipay" });
    expect(r2.applied).toBe(false);
    expect(r2.paidUntil.getTime()).toBe(r1.paidUntil.getTime());
  });

  it("paidUntil en el pasado = inactiva", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    await applyCharge(db, { orgId, chargeId: "x", source: "manual", days: -1 });
    expect(await hasActiveSubscription(db, orgId)).toBe(false);
    expect((await getSubscription(db, orgId)).status).toBe("expired");
  });

  it("suspendida = inactiva aunque paidUntil sea futuro", async () => {
    const { db } = makeTestDb();
    const orgId = await seedOrg(db);
    await applyCharge(db, { orgId, chargeId: "y", source: "manual" });
    await setSuspended(db, orgId, true);
    expect(await hasActiveSubscription(db, orgId)).toBe(false);
    await setSuspended(db, orgId, false);
    expect(await hasActiveSubscription(db, orgId)).toBe(true);
  });
});
