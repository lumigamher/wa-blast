import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, products, productVariants } from "@/lib/db/schema";
import { addVariant, listVariants, setVariantAvailable, deleteVariant } from "./variants";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(products).values({ id: "p1", orgId: "o1", name: "Widget", priceCop: 1000, createdAt: new Date() });
}

describe("variants", () => {
  it("addVariant inserts and listVariants returns it", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addVariant(db, "o1", "p1", { label: "Rojo", priceCop: 2000, sku: "SKU-RED" });
    const variants = await listVariants(db, "p1");
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
    const [variant] = await listVariants(db, "p1");
    expect(variant?.available).toBe(true);
    await setVariantAvailable(db, "o1", variant!.id, false);
    const [updated] = await listVariants(db, "p1");
    expect(updated?.available).toBe(false);
  });

  it("deleteVariant scoped to org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addVariant(db, "o1", "p1", { label: "Green" });
    const [variant] = await listVariants(db, "p1");
    await deleteVariant(db, "o1", variant!.id);
    const variants = await listVariants(db, "p1");
    expect(variants).toHaveLength(0);
  });

  it("deleteVariant with wrong org does not delete", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addVariant(db, "o1", "p1", { label: "Yellow" });
    const [variant] = await listVariants(db, "p1");
    await deleteVariant(db, "o2", variant!.id);
    const variants = await listVariants(db, "p1");
    expect(variants).toHaveLength(1);
  });
});
