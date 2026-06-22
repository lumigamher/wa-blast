import { describe, expect, it } from "vitest";
import { validateProductRows } from "./import";

describe("validateProductRows", () => {
  it("valida productos y variantes, reporta inválidas", () => {
    const rows = [
      { nombre: "Camisa", precio: "20000", sku: "C1", descripcion: "Algodón", disponible: "sí" },
      { nombre: "", precio: "", sku: "C1", variante: "Talla L", precio_variante: "22000", sku_variante: "C1-L", disponible_variante: "sí" },
      { nombre: "Pantalón", precio: "abc", sku: "P1" },
      { nombre: "", precio: "", sku: "", variante: "Suelta" },
      { nombre: "", precio: "", sku: "" },
    ];
    const res = validateProductRows(rows);
    expect(res.valid.length).toBe(2);
    expect(res.invalid.map((i) => i.row)).toEqual([4, 5, 6]);
    expect(res.valid[0].name).toBe("Camisa");
    expect(res.valid[0].priceCop).toBe(20000);
    expect(res.valid[0].available).toBe(true);
    expect(res.valid[1].name).toBeNull();
    expect(res.valid[1].variant?.label).toBe("Talla L");
    expect(res.valid[1].variant?.priceCop).toBe(22000);
  });

  it("disponible vacío = true; 'no'/'agotado' = false", () => {
    const res = validateProductRows([
      { nombre: "A", precio: "1", sku: "A" },
      { nombre: "B", precio: "1", sku: "B", disponible: "no" },
      { nombre: "C", precio: "1", sku: "C", disponible: "agotado" },
    ]);
    expect(res.valid.map((v) => v.available)).toEqual([true, false, false]);
  });
});
