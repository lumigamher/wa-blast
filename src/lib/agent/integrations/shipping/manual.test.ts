import { describe, expect, it } from "vitest";
import { makeManualShipping } from "./manual";

const cfg = {
  rates: [
    { city: "Bogotá", maxWeightKg: 1, priceCop: 8000, deliveryDays: 2 },
    { city: "Bogotá", maxWeightKg: 5, priceCop: 12000, deliveryDays: 2 },
    { maxWeightKg: 1, priceCop: 10000, deliveryDays: 4 },
    { maxWeightKg: 5, priceCop: 16000, deliveryDays: 4 },
  ],
};

describe("makeManualShipping", () => {
  it("elige la tarifa por ciudad y peso (primer tier que cubre el peso)", async () => {
    const q = await makeManualShipping(cfg).quote({
      originCityName: "Medellín",
      destinationCityName: "Bogotá",
      pkg: { pesoFacturableKg: 0.5, lengthCm: 10, widthCm: 10, heightCm: 10 },
      declaredValueCop: 50000,
    });
    expect(q[0].priceCop).toBe(8000);
    expect(q[0].deliveryDays).toBe(2);
  });

  it("usa default cuando la ciudad no tiene tarifa", async () => {
    const q = await makeManualShipping(cfg).quote({
      originCityName: "Medellín",
      destinationCityName: "Leticia",
      pkg: { pesoFacturableKg: 3, lengthCm: 10, widthCm: 10, heightCm: 10 },
      declaredValueCop: 1,
    });
    expect(q[0].priceCop).toBe(16000);
  });

  it("sin cobertura para el peso → []", async () => {
    const q = await makeManualShipping({ rates: [{ maxWeightKg: 1, priceCop: 1000 }] }).quote({
      originCityName: "X",
      destinationCityName: "Y",
      pkg: { pesoFacturableKg: 10, lengthCm: 1, widthCm: 1, heightCm: 1 },
      declaredValueCop: 1,
    });
    expect(q).toEqual([]);
  });
});
