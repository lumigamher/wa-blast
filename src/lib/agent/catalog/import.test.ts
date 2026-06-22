import { describe, expect, it } from "vitest";
import { validateProductRows } from "./import-client";
import { bulkImportProducts, buildProductsTemplate } from "./import";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { listProducts } from "@/lib/agent/admin";
import { listVariants } from "./variants";
import * as XLSX from "xlsx";

describe("validateProductRows", () => {
  it("valida productos y variantes, reporta inválidas", () => {
    const rows = [
      { nombre: "Camisa", precio: "20000", sku: "C1", descripcion: "Algodón", disponible: "sí", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
      { nombre: "", precio: "", sku: "C1", descripcion: "", disponible: "", variante: "Talla L", precio_variante: "22000", sku_variante: "C1-L", disponible_variante: "sí" },
      { nombre: "Pantalón", precio: "abc", sku: "P1", descripcion: "", disponible: "", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
      { nombre: "", precio: "", sku: "", descripcion: "", disponible: "", variante: "Suelta", precio_variante: "", sku_variante: "", disponible_variante: "" },
      { nombre: "", precio: "", sku: "", descripcion: "", disponible: "", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
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
      { nombre: "A", precio: "1", sku: "A", descripcion: "", disponible: "", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
      { nombre: "B", precio: "1", sku: "B", descripcion: "", disponible: "no", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
      { nombre: "C", precio: "1", sku: "C", descripcion: "", disponible: "agotado", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
    ]);
    expect(res.valid.map((v) => v.available)).toEqual([true, false, false]);
  });
});

describe("bulkImportProducts", () => {
  it("upsert de productos y variantes agrupados por sku", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });

    const { valid } = validateProductRows([
      { nombre: "Camisa", precio: "20000", sku: "C1", descripcion: "", disponible: "", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
      { nombre: "", precio: "", sku: "C1", descripcion: "", disponible: "", variante: "Talla L", precio_variante: "22000", sku_variante: "", disponible_variante: "" },
      { nombre: "Pantalón", precio: "30000", sku: "P1", descripcion: "", disponible: "", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" },
    ]);

    const r1 = await bulkImportProducts(db, "o1", valid);
    expect(r1.productsCreated).toBe(2);
    expect(r1.variantsCreated).toBe(1);
    expect((await listProducts(db, "o1")).length).toBe(2);

    // Second import: update existing product
    const { valid: valid2 } = validateProductRows([{ nombre: "Camisa Premium", precio: "25000", sku: "C1", descripcion: "", disponible: "", variante: "", precio_variante: "", sku_variante: "", disponible_variante: "" }]);
    const r2 = await bulkImportProducts(db, "o1", valid2);
    expect(r2.productsUpdated).toBe(1);

    const list = await listProducts(db, "o1");
    expect(list.length).toBe(2);
    expect(list.find((p) => p.sku === "C1")?.name).toBe("Camisa Premium");

    const camisa = list.find((p) => p.sku === "C1")!;
    expect((await listVariants(db, "o1", camisa.id)).length).toBe(1);
  });
});

describe("buildProductsTemplate", () => {
  it("genera un XLSX con los encabezados esperados", async () => {
    const buf = await buildProductsTemplate();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false, defval: "" });

    expect(Object.keys(rows[0])).toEqual([
      "nombre",
      "precio",
      "sku",
      "descripcion",
      "disponible",
      "variante",
      "precio_variante",
      "sku_variante",
      "disponible_variante",
    ]);
  });
});
