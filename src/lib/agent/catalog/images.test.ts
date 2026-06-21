import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, products, productVariants, productImages } from "@/lib/db/schema";
import { addImageUrl, addImageUpload, listImages, deleteImage, imageUrl } from "./images";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(products).values({ id: "p1", orgId: "o1", name: "Widget", priceCop: 1000, createdAt: new Date() });
  await db.insert(productVariants).values({ id: "v1", productId: "p1", orgId: "o1", label: "Red", createdAt: new Date() });
}

describe("images", () => {
  it("addImageUrl inserts and listImages returns it with source url", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addImageUrl(db, "o1", "p1", { url: "https://example.com/img.png", label: "Front" });
    const images = await listImages(db, "p1");
    expect(images).toHaveLength(1);
    expect(images[0]!.source).toBe("url");
    expect(images[0]!.url).toBe("https://example.com/img.png");
    expect(images[0]!.label).toBe("Front");
  });

  it("imageUrl returns the raw url for source url", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addImageUrl(db, "o1", "p1", { url: "https://example.com/img.png" });
    const [image] = await listImages(db, "p1");
    expect(imageUrl(image!)).toBe("https://example.com/img.png");
  });

  it("addImageUpload inserts and listImages returns it with source upload", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addImageUpload(db, "o1", "p1", { mediaAssetId: "ma-123", label: "Back" });
    const images = await listImages(db, "p1");
    expect(images).toHaveLength(1);
    expect(images[0]!.source).toBe("upload");
    expect(images[0]!.mediaAssetId).toBe("ma-123");
    expect(images[0]!.label).toBe("Back");
  });

  it("imageUrl returns /api/inbox/media/<mediaAssetId> for source upload", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addImageUpload(db, "o1", "p1", { mediaAssetId: "ma-456" });
    const [image] = await listImages(db, "p1");
    expect(imageUrl(image!)).toBe("/api/inbox/media/ma-456");
  });

  it("deleteImage scoped to org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addImageUrl(db, "o1", "p1", { url: "https://example.com/img.png" });
    const [image] = await listImages(db, "p1");
    await deleteImage(db, "o1", image!.id);
    const images = await listImages(db, "p1");
    expect(images).toHaveLength(0);
  });

  it("deleteImage with wrong org does not delete", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addImageUrl(db, "o1", "p1", { url: "https://example.com/img.png" });
    const [image] = await listImages(db, "p1");
    await deleteImage(db, "o2", image!.id);
    const images = await listImages(db, "p1");
    expect(images).toHaveLength(1);
  });

  it("addImageUrl with empty url throws", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await expect(addImageUrl(db, "o1", "p1", { url: "   " })).rejects.toThrow("URL requerida");
  });

  it("listImages with variantId association", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addImageUrl(db, "o1", "p1", { url: "https://example.com/1.png", variantId: "v1" });
    await addImageUrl(db, "o1", "p1", { url: "https://example.com/2.png" });
    const images = await listImages(db, "p1");
    expect(images).toHaveLength(2);
    expect(images[0]!.variantId).toBe("v1");
    expect(images[1]!.variantId).toBeNull();
  });
});
