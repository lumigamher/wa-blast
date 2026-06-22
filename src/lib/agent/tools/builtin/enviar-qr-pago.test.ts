import { describe, expect, it, vi, afterEach } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, organizationSettings } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto/encrypt";
import { addPaymentMethod, setPaymentMethodQr, listPaymentMethods } from "../../payments/methods";
import { saveMediaAsset } from "@/lib/media/store";
import { enviarQrPago } from "./enviar-qr-pago";

describe("enviar_qr_pago", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("envía QR de un medio de pago por WhatsApp", async () => {
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

    // Add payment method
    await addPaymentMethod(db, "o1", {
      type: "nequi",
      label: "Nequi Principal",
      details: "3157000000",
    });

    // Get the method and add QR
    const methods = await listPaymentMethods(db, "o1", false);
    const method = methods[0];

    // Create a fake QR file and save it as media asset
    const fakeQr = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const asset = await saveMediaAsset(db, {
      orgId: "o1",
      bytes: fakeQr.buffer,
      mime: "image/png",
      kind: "image",
    });

    // Set QR for payment method
    await setPaymentMethodQr(db, "o1", method.id, asset.id);

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
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const r = await enviarQrPago.run({}, { db, orgId: "o1", conversationId: "conv1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { enviado: boolean };
      expect(data.enviado).toBe(true);
    }
  });

  it("falla si no hay método con QR", async () => {
    const { db } = makeTestDb();

    await db.insert(organization).values({
      id: "o2",
      name: "o2",
      slug: "o2",
      createdAt: new Date(),
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

    // Add payment method without QR
    await addPaymentMethod(db, "o2", {
      type: "daviplata",
      label: "DaviPlata",
      details: "312XXXX",
    });

    const r = await enviarQrPago.run({}, { db, orgId: "o2", conversationId: "conv2" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("QR");
    }
  });

  it("falla si no hay métodos configurados", async () => {
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

    const r = await enviarQrPago.run({}, { db, orgId: "o3", conversationId: "conv3" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("configurados");
    }
  });

  it("selecciona por type cuando no hay methodId", async () => {
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

    // Add two methods, one with QR
    await addPaymentMethod(db, "o4", { type: "nequi", label: "Nequi", details: "111" });
    await addPaymentMethod(db, "o4", { type: "daviplata", label: "DaviPlata", details: "222" });

    const methods = await listPaymentMethods(db, "o4", false);
    const daviMethod = methods.find((m) => m.type === "daviplata");

    // Add QR to daviplata
    const fakeQr = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const asset = await saveMediaAsset(db, {
      orgId: "o4",
      bytes: fakeQr.buffer,
      mime: "image/png",
      kind: "image",
    });

    await setPaymentMethodQr(db, "o4", daviMethod!.id, asset.id);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/media") && u.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ id: "meta_media_2" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/messages") && u.includes("graph.facebook.com")) {
        return new Response(JSON.stringify({ messages: [{ id: "m2" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const r = await enviarQrPago.run({ type: "daviplata" }, { db, orgId: "o4", conversationId: "conv4" });
    expect(r.ok).toBe(true);
  });
});
