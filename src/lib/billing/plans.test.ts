import { describe, expect, it } from "vitest";
import {
  getPlan,
  isPlanId,
  modulesForPlan,
  PLAN_IDS,
  planHasModule,
  planRank,
  proratedUpgradeCop,
  upgradeTargets,
} from "./plans";

describe("plan catalog", () => {
  it("tiene 3 planes ordenados con los precios pactados", () => {
    expect(PLAN_IDS).toEqual(["esencial", "pro", "premium"]);
    expect(getPlan("esencial").defaultPriceCop).toBe(49997);
    expect(getPlan("pro").defaultPriceCop).toBe(70997);
    expect(getPlan("premium").defaultPriceCop).toBe(99997);
  });

  it("reparto por módulos es acumulativo", () => {
    expect(modulesForPlan("esencial")).toEqual([
      "campanas",
      "inbox",
      "plantillas",
      "contactos",
    ]);
    // pro añade flows + carrusel
    expect(planHasModule("pro", "flows")).toBe(true);
    expect(planHasModule("pro", "carrusel")).toBe(true);
    expect(planHasModule("esencial", "flows")).toBe(false);
    // llamadas solo en premium
    expect(planHasModule("premium", "llamadas")).toBe(true);
    expect(planHasModule("pro", "llamadas")).toBe(false);
    // premium incluye todo lo de pro
    for (const m of modulesForPlan("pro")) {
      expect(planHasModule("premium", m)).toBe(true);
    }
  });

  it("rangos crecientes", () => {
    expect(planRank("esencial")).toBeLessThan(planRank("pro"));
    expect(planRank("pro")).toBeLessThan(planRank("premium"));
  });

  it("upgradeTargets devuelve solo planes superiores", () => {
    expect(upgradeTargets("esencial").map((p) => p.id)).toEqual([
      "pro",
      "premium",
    ]);
    expect(upgradeTargets("pro").map((p) => p.id)).toEqual(["premium"]);
    expect(upgradeTargets("premium")).toEqual([]);
  });

  it("isPlanId valida correctamente", () => {
    expect(isPlanId("pro")).toBe(true);
    expect(isPlanId("gratis")).toBe(false);
  });
});

describe("proratedUpgradeCop", () => {
  it("cobra la diferencia escalada por días restantes", () => {
    // diff 21000, mitad del ciclo → ~10500
    expect(
      proratedUpgradeCop({
        currentPriceCop: 49997,
        targetPriceCop: 70997,
        remainingDays: 15,
        periodDays: 30,
      }),
    ).toBe(10500);
  });

  it("ciclo completo cobra la diferencia entera", () => {
    expect(
      proratedUpgradeCop({
        currentPriceCop: 49997,
        targetPriceCop: 99997,
        remainingDays: 30,
        periodDays: 30,
      }),
    ).toBe(50000);
  });

  it("downgrade o sin días restantes → 0", () => {
    expect(
      proratedUpgradeCop({
        currentPriceCop: 99997,
        targetPriceCop: 49997,
        remainingDays: 15,
        periodDays: 30,
      }),
    ).toBe(0);
    expect(
      proratedUpgradeCop({
        currentPriceCop: 49997,
        targetPriceCop: 70997,
        remainingDays: 0,
        periodDays: 30,
      }),
    ).toBe(0);
  });

  it("acota días restantes al período", () => {
    expect(
      proratedUpgradeCop({
        currentPriceCop: 49997,
        targetPriceCop: 70997,
        remainingDays: 60,
        periodDays: 30,
      }),
    ).toBe(21000);
  });
});
