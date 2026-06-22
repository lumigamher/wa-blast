import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, products } from "@/lib/db/schema";
import { addVariant, listVariants, setVariantAvailable, deleteVariant, upsertVariant } from "./variants";
import { upsertProductBySku } from "@/lib/agent/admin";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(products).values({ id: "p1", orgId: "o1", name: "Widget", priceCop: 1000, createdAt: new Date() });
}

describe("variants", () => {
  it("addVariant inserts and listVariants returns it", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addVariant(db, "o1", "p1", { label: "Rojo", priceCop: 2000, sku: "SKU-RED" });
    const variants = await listVariants(db, "o1", "p1");
    expect(variants).toHaveLength(1);
    expect(variants[0]!.label).toBe("Rojo");
    expect(variants[0]!.priceCop).toBe(2000);
    expect(variants[0]!.sku).toBe("SKU-RED");
  });

  it("addVariant with empty label throws", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await expect(addVariant(db, "o1", "p1", { label: "   " })).rejects.toThrow("Etiqueta requerida");
  });

  it("setVariantAvailable toggles availability", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addVariant(db, "o1", "p1", { label: "Blue" });
    const [variant] = await listVariants(db, "o1", "p1");
    expect(variant?.available).toBe(true);
    await setVariantAvailable(db, "o1", variant!.id, false);
    const [updated] = await listVariants(db, "o1", "p1");
    expect(updated?.available).toBe(false);
  });

  it("deleteVariant scoped to org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addVariant(db, "o1", "p1", { label: "Green" });
    const [variant] = await listVariants(db, "o1", "p1");
    await deleteVariant(db, "o1", variant!.id);
    const variants = await listVariants(db, "o1", "p1");
    expect(variants).toHaveLength(0);
  });

  it("deleteVariant with wrong org does not delete", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addVariant(db, "o1", "p1", { label: "Yellow" });
    const [variant] = await listVariants(db, "o1", "p1");
    await deleteVariant(db, "o2", variant!.id);
    const variants = await listVariants(db, "o1", "p1");
    expect(variants).toHaveLength(1);
  });

  it("crea por etiqueta y actualiza si existe", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const { id: productId } = await upsertProductBySku(db, "o1", { name: "Camisa", priceCop: 1000, sku: "C1" });
    const a = await upsertVariant(db, "o1", productId, { label: "Talla L", priceCop: 1200, sku: "C1-L" });
    expect(a.action).toBe("created");
    const b = await upsertVariant(db, "o1", productId, { label: "Talla L", priceCop: 1300 });
    expect(b.action).toBe("updated");
    expect(b.id).toBe(a.id);
    const vs = await listVariants(db, "o1", productId);
    expect(vs.length).toBe(1);
    expect(vs[0].priceCop).toBe(1300);
    expect(vs[0].sku).toBe("C1-L");
  });

  it("listVariants no devuelve variantes de otra org", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    const { id: productId } = await upsertProductBySku(db, "o1", { name: "P", priceCop: 1, sku: "P1" });
    await addVariant(db, "o1", productId, { label: "L" });
    expect((await listVariants(db, "o1", productId)).length).toBe(1);
    expect((await listVariants(db, "o2", productId)).length).toBe(0);
  });
});
