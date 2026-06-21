import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, products, productVariants, productImages } from "@/lib/db/schema";
import { makeInternalCatalog } from "./internal";
import { randomUUID } from "node:crypto";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(products).values([
    { id: "p1", orgId: "o1", name: "Cerveza Aguila", priceCop: 2500, available: true, createdAt: new Date() },
    { id: "p2", orgId: "o1", name: "Agua Cristal", priceCop: 1500, available: true, createdAt: new Date() },
    { id: "p3", orgId: "o1", name: "Cerveza Club Colombia", priceCop: 3000, available: false, createdAt: new Date() },
  ]);
}

async function seedWithVariantsAndImages(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
  await db.insert(products).values({
    id: "p-with-variants",
    orgId: "o2",
    name: "Test Product",
    priceCop: 5000,
    available: true,
    createdAt: new Date(),
  });

  // Add two variants: one with price override, one with null price (falls back to product price)
  await db.insert(productVariants).values([
    {
      id: "v1",
      productId: "p-with-variants",
      orgId: "o2",
      label: "Variant A (Premium)",
      priceCop: 7000,
      sku: "SKU-A-001",
      available: true,
      sortOrder: 0,
      createdAt: new Date(),
    },
    {
      id: "v2",
      productId: "p-with-variants",
      orgId: "o2",
      label: "Variant B (Standard)",
      priceCop: null,
      sku: "SKU-B-001",
      available: true,
      sortOrder: 1,
      createdAt: new Date(),
    },
  ]);

  // Add two images: one URL source, one upload source
  const mediaAssetId = `media_${randomUUID()}`;
  await db.insert(productImages).values([
    {
      id: `img1`,
      productId: "p-with-variants",
      orgId: "o2",
      variantId: null,
      source: "url",
      mediaAssetId: null,
      url: "https://example.com/product.jpg",
      label: "Main Image",
      sortOrder: 0,
      createdAt: new Date(),
    },
    {
      id: `img2`,
      productId: "p-with-variants",
      orgId: "o2",
      variantId: "v1",
      source: "upload",
      mediaAssetId: mediaAssetId,
      url: null,
      label: "Variant A Image",
      sortOrder: 1,
      createdAt: new Date(),
    },
  ]);
}

describe("internal catalog", () => {
  it("busca por nombre (case-insensitive), solo disponibles", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const cat = makeInternalCatalog(db, "o1");
    const res = await cat.search({ query: "cerveza" });
    expect(res.map((p) => p.id)).toEqual(["p1"]); // p3 no disponible
    expect(res[0].priceCop).toBe(2500);
  });
  it("get devuelve el producto o null", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const cat = makeInternalCatalog(db, "o1");
    expect((await cat.get("p2"))?.name).toBe("Agua Cristal");
    expect(await cat.get("nope")).toBeNull();
  });
  it("get devuelve variantes e imágenes enriquecidas", async () => {
    const { db } = makeTestDb();
    await seedWithVariantsAndImages(db);
    const cat = makeInternalCatalog(db, "o2");

    const prod = await cat.get("p-with-variants");
    expect(prod).not.toBeNull();
    expect(prod?.name).toBe("Test Product");

    // Variants
    expect(prod?.variants).toHaveLength(2);
    expect(prod?.variants?.[0].id).toBe("v1");
    expect(prod?.variants?.[0].label).toBe("Variant A (Premium)");
    expect(prod?.variants?.[0].priceCop).toBe(7000); // Price override
    expect(prod?.variants?.[0].sku).toBe("SKU-A-001");
    expect(prod?.variants?.[0].available).toBe(true);

    expect(prod?.variants?.[1].id).toBe("v2");
    expect(prod?.variants?.[1].label).toBe("Variant B (Standard)");
    expect(prod?.variants?.[1].priceCop).toBe(5000); // Falls back to product price
    expect(prod?.variants?.[1].sku).toBe("SKU-B-001");

    // Images
    expect(prod?.images).toHaveLength(2);
    expect(prod?.images?.[0].url).toBe("https://example.com/product.jpg");
    expect(prod?.images?.[0].label).toBe("Main Image");
    expect(prod?.images?.[0].variantId).toBeNull();

    const mediaId = prod?.images?.[1].url.split("/").pop();
    expect(prod?.images?.[1].url).toBe(`/api/inbox/media/${mediaId}`);
    expect(prod?.images?.[1].label).toBe("Variant A Image");
    expect(prod?.images?.[1].variantId).toBe("v1");
  });
});
