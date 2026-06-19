import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { getPlanPriceCop, getPlanPrices, setPlanPriceCop } from "@/lib/billing/config";
import { PLANS } from "@/lib/billing/plans";

describe("billing config", () => {
  it("devuelve el default si no hay valor", async () => {
    const { db } = makeTestDb();
    expect(await getPlanPriceCop(db, "esencial")).toBe(PLANS.esencial.defaultPriceCop);
  });

  it("set + get round-trip para esencial", async () => {
    const { db } = makeTestDb();
    await setPlanPriceCop(db, "esencial", 300000);
    expect(await getPlanPriceCop(db, "esencial")).toBe(300000);
    await setPlanPriceCop(db, "esencial", 199000);
    expect(await getPlanPriceCop(db, "esencial")).toBe(199000);
  });

  it("get all prices", async () => {
    const { db } = makeTestDb();
    await setPlanPriceCop(db, "esencial", 300000);
    await setPlanPriceCop(db, "pro", 400000);
    const prices = await getPlanPrices(db);
    expect(prices.esencial).toBe(300000);
    expect(prices.pro).toBe(400000);
    expect(prices.premium).toBe(PLANS.premium.defaultPriceCop);
  });

  it("rechaza valores no positivos", async () => {
    const { db } = makeTestDb();
    await expect(setPlanPriceCop(db, "esencial", 0)).rejects.toThrow();
    await expect(setPlanPriceCop(db, "pro", -5)).rejects.toThrow();
  });
});
