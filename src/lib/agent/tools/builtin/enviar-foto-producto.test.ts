import { describe, expect, it, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, mediaAssets, messages, products, organizationSettings } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto/encrypt";
import { addImageUrl } from "../../catalog/images";
import { saveCatalogConfig } from "../../integrations/catalog/config";
import { enviarFotoProducto, buildCaption } from "./enviar-foto-producto";

describe("buildCaption", () => {
  it("construye caption con nombre, variante y precio", () => {
    const result = buildCaption(
      { name: "Cerveza Aguila", priceCop: 2500, description: "Deliciosa cerveza" },
      "Lata 350ml",
    );
    expect(result).toContain("Cerveza Aguila");
    expect(result).toContain("Lata 350ml");
    expect(result).toContain("$2.500");
    expect(result).toContain("Deliciosa cerveza");
  });

  it("construye caption sin variante si no se proporciona", () => {
    const result = buildCaption({
      name: "Producto X",
      priceCop: 5000,
      description: "Descripción",
    });
    expect(result).toContain("Producto X");
    expect(result).toContain("$5.000");
    expect(result).toContain("Descripción");
    expect(result).not.toContain("—");
  });

  it("construye caption sin descripción si es null", () => {
    const result = buildCaption({
      name: "Producto Y",
      priceCop: 3000,
      description: null,
    });
    expect(result).toBe("Producto Y · $3.000");
  });

  it("trunca descripción si caption exceede 1024 caracteres", () => {
    const longDesc = "a".repeat(1000);
    const result = buildCaption(
      { name: "Producto", priceCop: 1000, description: longDesc },
      "Variante",
    );
    expect(result.length).toBeLessThanOrEqual(1024);
    expect(result.endsWith("…")).toBe(true);
  });

  it("formatea precio en formato colombiano (es-CO)", () => {
    const result = buildCaption({
      name: "Test",
      priceCop: 1234567,
      description: null,
    });
    expect(result).toContain("$1.234.567");
  });
});

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

    // La foto debe quedar registrada en el inbox, si no el equipo no la ve
    const out = await db.select().from(messages).where(eq(messages.conversationId, "conv1"));
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe("out");
    expect(out[0].type).toBe("image");
    expect(out[0].wamid).toBe("m1");
    expect(out[0].body).toContain("Cerveza Aguila");
    // Apunta a un asset local (media_*), que es lo que la ruta del inbox sabe servir
    expect(out[0].mediaId).toMatch(/^media_/);
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, out[0].mediaId ?? ""));
    expect(asset?.orgId).toBe("o1");
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

  it("maneja error si no puede preparar imagen WebP", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o4",
      name: "o4",
      slug: "o4",
      createdAt: new Date(),
    });

    await db.insert(organizationSettings).values({
      orgId: "o4",
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
      id: "conv4",
      orgId: "o4",
      phone: "+57300000000",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    await db.insert(products).values({
      id: "prod4",
      orgId: "o4",
      name: "Producto WebP Inválido",
      priceCop: 5000,
      description: "Producto con imagen WebP inválida",
      available: true,
      createdAt: new Date(),
    });

    // Add WebP image
    await addImageUrl(db, "o4", "prod4", {
      url: "https://example.com/image.webp",
      label: null,
      variantId: undefined,
    });

    await saveCatalogConfig(db, "o4", {
      provider: "internal",
      credentials: {},
      config: {},
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/media") && u.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ id: "meta_media_webp" }), {
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
      // External image URL - return WebP mime but with invalid bytes that sharp can't parse
      return new Response(new Uint8Array([1, 2, 3, 4, 5]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    });

    const r = await enviarFotoProducto.run(
      { query: "inválido" },
      { db, orgId: "o4", conversationId: "conv4" },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("imagen");
    }
  });

  it("envía con caption completa (nombre, variante, precio, descripción)", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o5",
      name: "o5",
      slug: "o5",
      createdAt: new Date(),
    });

    await db.insert(organizationSettings).values({
      orgId: "o5",
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
      id: "conv5",
      orgId: "o5",
      phone: "+57300000000",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    await db.insert(products).values({
      id: "prod5",
      orgId: "o5",
      name: "Cerveza Premium",
      priceCop: 8500,
      description: "Cerveza artesanal de excelente calidad",
      available: true,
      createdAt: new Date(),
    });

    await addImageUrl(db, "o5", "prod5", {
      url: "https://example.com/cerveza.jpg",
      label: null,
      variantId: undefined,
    });

    await saveCatalogConfig(db, "o5", {
      provider: "internal",
      credentials: {},
      config: {},
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/media") && u.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ id: "meta_media_5" }), {
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
      return new Response(new Uint8Array([255, 216, 255, 224]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    const r = await enviarFotoProducto.run(
      { query: "cerveza", variantLabel: "Botella 350ml" },
      { db, orgId: "o5", conversationId: "conv5" },
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { enviado: boolean };
      expect(data.enviado).toBe(true);
    }
  });
});
