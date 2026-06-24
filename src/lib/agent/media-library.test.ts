import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, agentMediaLibrary } from "@/lib/db/schema";
import {
  mimeToKind,
  addMedia,
  listMedia,
  findMedia,
  deleteMedia,
} from "./media-library";

describe("media-library", () => {
  describe("mimeToKind", () => {
    it("image/* → image", () => {
      expect(mimeToKind("image/jpeg")).toBe("image");
      expect(mimeToKind("image/png")).toBe("image");
      expect(mimeToKind("image/webp")).toBe("image");
    });

    it("video/* → video", () => {
      expect(mimeToKind("video/mp4")).toBe("video");
      expect(mimeToKind("video/quicktime")).toBe("video");
    });

    it("other → document", () => {
      expect(mimeToKind("application/pdf")).toBe("document");
      expect(mimeToKind("application/msword")).toBe("document");
      expect(mimeToKind("text/plain")).toBe("document");
    });
  });

  describe("addMedia", () => {
    it("inserta un item en la biblioteca", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o1",
        name: "o1",
        slug: "o1",
        createdAt: new Date(),
      });

      const id = await addMedia(db, "o1", {
        kind: "image",
        mediaAssetId: "media_123",
        label: "Catálogo PDF",
        productId: "prod1",
      });

      expect(id).toBeTruthy();

      const [row] = await db
        .select()
        .from(agentMediaLibrary)
        .where(eq(agentMediaLibrary.id, id));
      expect(row).toBeDefined();
      expect(row.kind).toBe("image");
      expect(row.mediaAssetId).toBe("media_123");
      expect(row.label).toBe("Catálogo PDF");
      expect(row.productId).toBe("prod1");
      expect(row.orgId).toBe("o1");
    });

    it("rechaza label vacía", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o2",
        name: "o2",
        slug: "o2",
        createdAt: new Date(),
      });

      await expect(
        addMedia(db, "o2", {
          kind: "document",
          mediaAssetId: "media_456",
          label: "   ",
        }),
      ).rejects.toThrow("Etiqueta requerida");
    });
  });

  describe("listMedia", () => {
    it("lista items de una org", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o3",
        name: "o3",
        slug: "o3",
        createdAt: new Date(),
      });

      // Insert 2 items
      await db.insert(agentMediaLibrary).values({
        id: "m1",
        orgId: "o3",
        kind: "image",
        mediaAssetId: "media_a",
        label: "Foto 1",
        productId: null,
        createdAt: new Date("2026-01-01"),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m2",
        orgId: "o3",
        kind: "document",
        mediaAssetId: "media_b",
        label: "Catálogo",
        productId: null,
        createdAt: new Date("2026-01-02"),
      });

      const items = await listMedia(db, "o3");
      expect(items).toHaveLength(2);
      expect(items[0].label).toBe("Catálogo"); // Ordered by label (ascending)
      expect(items[1].label).toBe("Foto 1");
    });

    it("filtra por productId", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o4",
        name: "o4",
        slug: "o4",
        createdAt: new Date(),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m3",
        orgId: "o4",
        kind: "image",
        mediaAssetId: "media_c",
        label: "Foto Producto A",
        productId: "prod_a",
        createdAt: new Date(),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m4",
        orgId: "o4",
        kind: "image",
        mediaAssetId: "media_d",
        label: "Foto Producto B",
        productId: "prod_b",
        createdAt: new Date(),
      });

      const items = await listMedia(db, "o4", { productId: "prod_a" });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("m3");
    });

    it("lista vacía si no hay items en la org", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o5",
        name: "o5",
        slug: "o5",
        createdAt: new Date(),
      });

      const items = await listMedia(db, "o5");
      expect(items).toHaveLength(0);
    });

    it("no lista items de otra org", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o6a",
        name: "o6a",
        slug: "o6a",
        createdAt: new Date(),
      });

      await db.insert(organization).values({
        id: "o6b",
        name: "o6b",
        slug: "o6b",
        createdAt: new Date(),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m5",
        orgId: "o6a",
        kind: "image",
        mediaAssetId: "media_e",
        label: "Secreto de A",
        productId: null,
        createdAt: new Date(),
      });

      const items = await listMedia(db, "o6b");
      expect(items).toHaveLength(0);
    });
  });

  describe("findMedia", () => {
    it("encuentra media por query case-insensitive", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o7",
        name: "o7",
        slug: "o7",
        createdAt: new Date(),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m6",
        orgId: "o7",
        kind: "document",
        mediaAssetId: "media_f",
        label: "Catálogo PDF",
        productId: null,
        createdAt: new Date(),
      });

      let item = await findMedia(db, "o7", "catálogo");
      expect(item).toBeDefined();
      expect(item?.id).toBe("m6");

      item = await findMedia(db, "o7", "CATÁLOGO");
      expect(item).toBeDefined();
      expect(item?.id).toBe("m6");

      item = await findMedia(db, "o7", "PDF");
      expect(item).toBeDefined();
      expect(item?.id).toBe("m6");
    });

    it("retorna null si no encuentra match", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o8",
        name: "o8",
        slug: "o8",
        createdAt: new Date(),
      });

      const item = await findMedia(db, "o8", "inexistente");
      expect(item).toBeNull();
    });

    it("no encuentra media de otra org", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o9a",
        name: "o9a",
        slug: "o9a",
        createdAt: new Date(),
      });

      await db.insert(organization).values({
        id: "o9b",
        name: "o9b",
        slug: "o9b",
        createdAt: new Date(),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m7",
        orgId: "o9a",
        kind: "document",
        mediaAssetId: "media_g",
        label: "Secreto",
        productId: null,
        createdAt: new Date(),
      });

      const item = await findMedia(db, "o9b", "secreto");
      expect(item).toBeNull();
    });
  });

  describe("deleteMedia", () => {
    it("elimina un item scoped por org", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o10",
        name: "o10",
        slug: "o10",
        createdAt: new Date(),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m8",
        orgId: "o10",
        kind: "image",
        mediaAssetId: "media_h",
        label: "Foto",
        productId: null,
        createdAt: new Date(),
      });

      await deleteMedia(db, "o10", "m8");

      const [row] = await db
        .select()
        .from(agentMediaLibrary)
        .where(eq(agentMediaLibrary.id, "m8"));
      expect(row).toBeUndefined();
    });

    it("no elimina item de otra org", async () => {
      const { db } = makeTestDb();

      await db.insert(organization).values({
        id: "o11a",
        name: "o11a",
        slug: "o11a",
        createdAt: new Date(),
      });

      await db.insert(organization).values({
        id: "o11b",
        name: "o11b",
        slug: "o11b",
        createdAt: new Date(),
      });

      await db.insert(agentMediaLibrary).values({
        id: "m9",
        orgId: "o11a",
        kind: "image",
        mediaAssetId: "media_i",
        label: "Foto de A",
        productId: null,
        createdAt: new Date(),
      });

      await deleteMedia(db, "o11b", "m9");

      const [row] = await db
        .select()
        .from(agentMediaLibrary)
        .where(eq(agentMediaLibrary.id, "m9"));
      expect(row).toBeDefined(); // Still there because org didn't match
    });
  });
});
