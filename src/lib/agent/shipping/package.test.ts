import { describe, expect, it } from "vitest";
import { computePackage } from "./package";

describe("computePackage", () => {
  it("una unidad: peso real y volumétrico", () => {
    const p = computePackage([
      {
        weightGrams: 1000,
        lengthCm: 20,
        widthCm: 20,
        heightCm: 10,
        quantity: 1,
      },
    ]);
    expect(p.pesoRealKg).toBeCloseTo(1, 5);
    expect(p.pesoVolumetricoKg).toBeCloseTo(1.6, 5);
    expect(p.pesoFacturableKg).toBeCloseTo(1.6, 5);
  });

  it("varias unidades suma peso y volumen", () => {
    const p = computePackage([
      {
        weightGrams: 500,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        quantity: 3,
      },
    ]);
    expect(p.pesoRealKg).toBeCloseTo(1.5, 5);
    expect(p.pesoVolumetricoKg).toBeCloseTo(1.2, 5);
    expect(p.pesoFacturableKg).toBeCloseTo(1.5, 5);
  });

  it("factor configurable", () => {
    const p = computePackage(
      [
        {
          weightGrams: 100,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 10,
          quantity: 1,
        },
      ],
      { volumetricFactor: 5000 }
    );
    expect(p.pesoVolumetricoKg).toBeCloseTo(0.2, 5);
  });

  it("lanza si falta peso o dimensión", () => {
    expect(() =>
      computePackage([
        {
          weightGrams: null,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 10,
          quantity: 1,
        },
      ])
    ).toThrow(/peso|dimension/i);

    expect(() =>
      computePackage([
        {
          weightGrams: 100,
          lengthCm: null,
          widthCm: 10,
          heightCm: 10,
          quantity: 1,
        },
      ])
    ).toThrow(/dimension/i);
  });
});
