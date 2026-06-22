export type PackageItem = {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  quantity: number;
};

export type ComputedPackage = {
  pesoRealKg: number;
  pesoVolumetricoKg: number;
  pesoFacturableKg: number;
  dims: { lengthCm: number; widthCm: number; heightCm: number };
};

const DEFAULT_FACTOR = 2500;

export function computePackage(
  items: PackageItem[],
  opts: { volumetricFactor?: number } = {}
): ComputedPackage {
  const factor = opts.volumetricFactor ?? DEFAULT_FACTOR;
  let totalGrams = 0;
  let totalVolumeCm3 = 0;

  for (const it of items) {
    if (it.weightGrams == null) throw new Error("Falta el peso de un producto");
    if (
      it.lengthCm == null ||
      it.widthCm == null ||
      it.heightCm == null
    ) {
      throw new Error("Faltan las dimensiones de un producto");
    }

    totalGrams += it.weightGrams * it.quantity;
    totalVolumeCm3 += it.lengthCm * it.widthCm * it.heightCm * it.quantity;
  }

  const pesoRealKg = totalGrams / 1000;
  const pesoVolumetricoKg = totalVolumeCm3 / factor;
  const side = Math.cbrt(totalVolumeCm3);

  return {
    pesoRealKg,
    pesoVolumetricoKg,
    pesoFacturableKg: Math.max(pesoRealKg, pesoVolumetricoKg),
    dims: {
      lengthCm: Math.round(side),
      widthCm: Math.round(side),
      heightCm: Math.round(side),
    },
  };
}
