import { describe, expect, it } from "vitest";
import { validateProductRows, bulkImportProducts } from "./import";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { listProducts } from "@/lib/agent/admin";
import { listVariants } from "./variants";

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

describe("bulkImportProducts", () => {
  it("upsert de productos y variantes agrupados por sku", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });

    const { valid } = validateProductRows([
      { nombre: "Camisa", precio: "20000", sku: "C1" },
      { nombre: "", precio: "", sku: "C1", variante: "Talla L", precio_variante: "22000" },
      { nombre: "Pantalón", precio: "30000", sku: "P1" },
    ]);

    const r1 = await bulkImportProducts(db, "o1", valid);
    expect(r1.productsCreated).toBe(2);
    expect(r1.variantsCreated).toBe(1);
    expect((await listProducts(db, "o1")).length).toBe(2);

    // Second import: update existing product
    const { valid: valid2 } = validateProductRows([{ nombre: "Camisa Premium", precio: "25000", sku: "C1" }]);
    const r2 = await bulkImportProducts(db, "o1", valid2);
    expect(r2.productsUpdated).toBe(1);

    const list = await listProducts(db, "o1");
    expect(list.length).toBe(2);
    expect(list.find((p) => p.sku === "C1")?.name).toBe("Camisa Premium");

    const camisa = list.find((p) => p.sku === "C1")!;
    expect((await listVariants(db, camisa.id)).length).toBe(1);
  });
});
