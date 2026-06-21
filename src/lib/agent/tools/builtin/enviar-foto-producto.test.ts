import { describe, expect, it, vi, afterEach } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, products, organizationSettings } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto/encrypt";
import { addImageUrl } from "../../catalog/images";
import { saveCatalogConfig } from "../../integrations/catalog/config";
import { enviarFotoProducto } from "./enviar-foto-producto";

describe("enviar_foto_producto", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("envía foto de producto por WhatsApp", async () => {
    const { db } = makeTestDb();

    // Seed org
    await db.insert(organization).values({
      id: "o1",
      name: "o1",
      slug: "o1",
      createdAt: new Date(),
    });

    // Seed organizationSettings with Meta credentials
    await db.insert(organizationSettings).values({
      orgId: "o1",
      metaPhoneId: "1234567890",
      metaWabaId: "waba123",
      metaAppId: "app123",
      metaAccessTokenEnc: encrypt("test-token"),
      metaAppSecretEnc: encrypt("test-secret"),
      metaVerifyToken: "verify",
      forwardUrl: null,
      optoutKeywords: JSON.stringify(["STOP"]),
      rateLimitMps: 20,
      defaultCountry: "CO",
      updatedAt: new Date(),
    });

    // Seed conversation with phone
    await db.insert(conversations).values({
      id: "conv1",
      orgId: "o1",
      phone: "+57300000000",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    // Seed product
    await db.insert(products).values({
      id: "prod1",
      orgId: "o1",
      name: "Cerveza Aguila",
      priceCop: 2500,
      available: true,
      createdAt: new Date(),
    });

    // Add image to product via addImageUrl
    await addImageUrl(db, "o1", "prod1", {
      url: "https://example.com/foto.jpg",
      label: null,
      variantId: undefined,
    });

    // Seed catalog config
    await saveCatalogConfig(db, "o1", {
      provider: "internal",
      credentials: {},
      config: {},
    });

    // Mock globalThis.fetch
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/media") && u.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ id: "meta_media_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/messages") && u.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ messages: [{ id: "m1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // External image URL
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    const r = await enviarFotoProducto.run(
      { query: "cerveza" },
      { db, orgId: "o1", conversationId: "conv1" },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { enviado: boolean };
      expect(data.enviado).toBe(true);
    }
  });

  it("producto sin imágenes → ok:false", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o2",
      name: "o2",
      slug: "o2",
      createdAt: new Date(),
    });

    await db.insert(organizationSettings).values({
      orgId: "o2",
      metaPhoneId: "1234567890",
      metaWabaId: "waba123",
      metaAppId: "app123",
      metaAccessTokenEnc: encrypt("test-token"),
      metaAppSecretEnc: encrypt("test-secret"),
      metaVerifyToken: "verify",
      forwardUrl: null,
      optoutKeywords: JSON.stringify(["STOP"]),
      rateLimitMps: 20,
      defaultCountry: "CO",
      updatedAt: new Date(),
    });

    await db.insert(conversations).values({
      id: "conv2",
      orgId: "o2",
      phone: "+57300000000",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    // Product sin imágenes
    await db.insert(products).values({
      id: "prod2",
      orgId: "o2",
      name: "Producto Sin Foto",
      priceCop: 5000,
      available: true,
      createdAt: new Date(),
    });

    await saveCatalogConfig(db, "o2", {
      provider: "internal",
      credentials: {},
      config: {},
    });

    const r = await enviarFotoProducto.run(
      { query: "sin foto" },
      { db, orgId: "o2", conversationId: "conv2" },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("fotos");
    }
  });

  it("sin catálogo configurado → ok:false", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o3",
      name: "o3",
      slug: "o3",
      createdAt: new Date(),
    });

    await db.insert(conversations).values({
      id: "conv3",
      orgId: "o3",
      phone: "+57300000000",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    const r = await enviarFotoProducto.run(
      { query: "x" },
      { db, orgId: "o3", conversationId: "conv3" },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Catálogo");
    }
  });
});
