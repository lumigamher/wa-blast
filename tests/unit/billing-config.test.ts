import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { DEFAULT_PLAN_PRICE_COP, getPlanPriceCop, setPlanPriceCop } from "@/lib/billing/config";

describe("billing config", () => {
  it("devuelve el default si no hay valor", async () => {
    const { db } = makeTestDb();
    expect(await getPlanPriceCop(db)).toBe(DEFAULT_PLAN_PRICE_COP);
  });

  it("set + get round-trip", async () => {
    const { db } = makeTestDb();
    await setPlanPriceCop(db, 300000);
    expect(await getPlanPriceCop(db)).toBe(300000);
    await setPlanPriceCop(db, 199000);
    expect(await getPlanPriceCop(db)).toBe(199000);
  });

  it("rechaza valores no positivos", async () => {
    const { db } = makeTestDb();
    await expect(setPlanPriceCop(db, 0)).rejects.toThrow();
    await expect(setPlanPriceCop(db, -5)).rejects.toThrow();
  });
});
