import { describe, expect, it } from "vitest";
import { calcularTotal } from "./calcular-total";

const ctx = { db: {} as never, orgId: "o1", conversationId: "c1" };

describe("calcular_total", () => {
  it("suma exacta (cantidad * precioUnitario)", async () => {
    const r = await calcularTotal.run(
      {
        items: [
          { nombre: "Cerveza", cantidad: 3, precioUnitario: 2500 },
          { nombre: "Agua", cantidad: 2, precioUnitario: 1500 },
        ],
      },
      ctx,
    );
    expect(r).toEqual({
      ok: true,
      data: {
        total: 10500,
        desglose: [
          { nombre: "Cerveza", cantidad: 3, precioUnitario: 2500, subtotal: 7500 },
          { nombre: "Agua", cantidad: 2, precioUnitario: 1500, subtotal: 3000 },
        ],
      },
    });
  });

  it("rechaza args inválidos vía schema (validación externa)", () => {
    const bad = calcularTotal.paramsSchema.safeParse({ items: [] });
    expect(bad.success).toBe(false);
  });
});
