import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import { makeTestDb } from "@/lib/db/test-db";
import {
  organization,
  conversations,
  agentMediaLibrary,
  mediaAssets,
  organizationSettings,
} from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto/encrypt";
import { enviarArchivo } from "./enviar-archivo";

// Mock fs.readFile at module level
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("enviar_archivo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("envía archivo de la biblioteca por WhatsApp", async () => {
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

    // Seed media asset
    await db.insert(mediaAssets).values({
      id: "media_pdf_1",
      orgId: "o1",
      kind: "document",
      mime: "application/pdf",
      path: "/tmp/test.pdf",
      bytes: 1024,
      createdAt: new Date(),
    });

    // Seed agent media library item
    await db.insert(agentMediaLibrary).values({
      id: "m1",
      orgId: "o1",
      kind: "document",
      mediaAssetId: "media_pdf_1",
      label: "Catálogo PDF",
      productId: null,
      createdAt: new Date(),
    });

    // Mock readFile to return PDF bytes
    vi.mocked(fs.readFile).mockResolvedValue(
      Buffer.from([37, 80, 68, 70, 1, 0, 0, 0]), // PDF magic bytes
    );

    // Mock Meta API calls
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/media") && u.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ id: "meta_doc_123" }), {
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
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const r = await enviarArchivo.run(
      { query: "catálogo" },
      { db, orgId: "o1", conversationId: "conv1" },
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { sent: string };
      expect(data.sent).toBe("Catálogo PDF");
    }
  });

  it("por mediaId: envía archivo específico", async () => {
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
      phone: "+57300000001",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    await db.insert(mediaAssets).values({
      id: "media_img_1",
      orgId: "o2",
      kind: "image",
      mime: "image/jpeg",
      path: "/tmp/test.jpg",
      bytes: 2048,
      createdAt: new Date(),
    });

    await db.insert(agentMediaLibrary).values({
      id: "m2",
      orgId: "o2",
      kind: "image",
      mediaAssetId: "media_img_1",
      label: "Logo",
      productId: null,
      createdAt: new Date(),
    });

    vi.mocked(fs.readFile).mockResolvedValue(
      Buffer.from([255, 216, 255, 224]), // JPEG magic bytes
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ messages: [{ id: "m1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const r = await enviarArchivo.run(
      { mediaId: "m2" },
      { db, orgId: "o2", conversationId: "conv2" },
    );

    expect(r.ok).toBe(true);
  });

  it("query no encontrada → ok:false", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o3",
      name: "o3",
      slug: "o3",
      createdAt: new Date(),
    });

    await db.insert(organizationSettings).values({
      orgId: "o3",
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
      id: "conv3",
      orgId: "o3",
      phone: "+57300000002",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    const r = await enviarArchivo.run(
      { query: "inexistente" },
      { db, orgId: "o3", conversationId: "conv3" },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("No encontré");
    }
  });

  it("archivo de otra org no se envía", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o4a",
      name: "o4a",
      slug: "o4a",
      createdAt: new Date(),
    });

    await db.insert(organization).values({
      id: "o4b",
      name: "o4b",
      slug: "o4b",
      createdAt: new Date(),
    });

    await db.insert(organizationSettings).values({
      orgId: "o4b",
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
      orgId: "o4b",
      phone: "+57300000003",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    // Media asset from org o4a
    await db.insert(mediaAssets).values({
      id: "media_secret",
      orgId: "o4a",
      kind: "document",
      mime: "application/pdf",
      path: "/tmp/secret.pdf",
      bytes: 1024,
      createdAt: new Date(),
    });

    // Media library item from org o4a
    await db.insert(agentMediaLibrary).values({
      id: "m_secret",
      orgId: "o4a",
      kind: "document",
      mediaAssetId: "media_secret",
      label: "Secreto",
      productId: null,
      createdAt: new Date(),
    });

    const r = await enviarArchivo.run(
      { mediaId: "m_secret" },
      { db, orgId: "o4b", conversationId: "conv4" },
    );

    expect(r.ok).toBe(false);
  });

  it("si no hay query ni mediaId → ok:false", async () => {
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
      phone: "+57300000004",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    const r = await enviarArchivo.run(
      {},
      { db, orgId: "o5", conversationId: "conv5" },
    );

    expect(r.ok).toBe(false);
  });

  it("maneja error si no puede preparar imagen WebP", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o6",
      name: "o6",
      slug: "o6",
      createdAt: new Date(),
    });

    await db.insert(organizationSettings).values({
      orgId: "o6",
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
      id: "conv6",
      orgId: "o6",
      phone: "+57300000005",
      contactId: null,
      lastMessageAt: new Date(),
      lastIncomingAt: null,
      unreadCount: 0,
      status: "open",
      agentPaused: false,
      createdAt: new Date(),
    });

    // Seed WebP image asset with invalid data
    await db.insert(mediaAssets).values({
      id: "media_webp_1",
      orgId: "o6",
      kind: "image",
      mime: "image/webp",
      path: "/tmp/test.webp",
      bytes: 5,
      createdAt: new Date(),
    });

    // Seed agent media library item
    await db.insert(agentMediaLibrary).values({
      id: "m6",
      orgId: "o6",
      kind: "image",
      mediaAssetId: "media_webp_1",
      label: "Imagen WebP Inválida",
      productId: null,
      createdAt: new Date(),
    });

    // Mock readFile to return invalid WebP bytes
    vi.mocked(fs.readFile).mockResolvedValue(
      Buffer.from([1, 2, 3, 4, 5]), // Invalid WebP data
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ messages: [{ id: "m1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const r = await enviarArchivo.run(
      { mediaId: "m6" },
      { db, orgId: "o6", conversationId: "conv6" },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("imagen");
    }
  });
});
