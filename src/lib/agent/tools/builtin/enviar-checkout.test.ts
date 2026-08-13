import { describe, expect, it, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messages, organization, organizationSettings, orders } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto/encrypt";
import { saveAgentConfig } from "@/lib/agent/config";
import { enviarCheckout } from "./enviar-checkout";

describe("enviar_checkout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fails when no pending order exists", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o1",
      metaPhoneId: "123",
      metaAccessTokenEnc: encrypt("test-token"),
      updatedAt: new Date(),
    });
    await db.insert(conversations).values({
      id: "c1",
      orgId: "o1",
      phone: "+57300",
      lastMessageAt: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
    });
    await saveAgentConfig(db, "o1", { checkoutFlowId: "flow-123" });

    const r = await enviarCheckout.run({}, { db, orgId: "o1", conversationId: "c1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("No hay un pedido");
    }
  });

  it("fails when no checkout flow is configured", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o2",
      metaPhoneId: "123",
      metaAccessTokenEnc: encrypt("test-token"),
      updatedAt: new Date(),
    });
    await db.insert(conversations).values({
      id: "c2",
      orgId: "o2",
      phone: "+57301",
      lastMessageAt: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
    });
    await db.insert(orders).values({
      id: "ord-1",
      orgId: "o2",
      conversationId: "c2",
      status: "pendiente",
      totalCop: 50000,
      itemsJson: "[]",
      createdAt: new Date(),
    });
    // Don't set checkoutFlowId
    await saveAgentConfig(db, "o2", {});

    const r = await enviarCheckout.run({}, { db, orgId: "o2", conversationId: "c2" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("No hay Flow de checkout configurado");
    }
  });

  it("falla si la conversación no tiene ninguna identidad (ni teléfono ni BSUID)", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o3", name: "o3", slug: "o3", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o3",
      metaPhoneId: "123",
      metaAccessTokenEnc: encrypt("test-token"),
      updatedAt: new Date(),
    });
    await db.insert(conversations).values({
      id: "c3",
      orgId: "o3",
      phone: "",
      lastMessageAt: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
    });
    await db.insert(orders).values({
      id: "ord-2",
      orgId: "o3",
      conversationId: "c3",
      status: "pendiente",
      totalCop: 50000,
      itemsJson: "[]",
      createdAt: new Date(),
    });
    await saveAgentConfig(db, "o3", { checkoutFlowId: "flow-456" });

    const r = await enviarCheckout.run({}, { db, orgId: "o3", conversationId: "c3" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("sin destinatario");
    }
  });

  it("successfully sends order summary and checkout flow", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o4", name: "o4", slug: "o4", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o4",
      metaPhoneId: "123",
      metaAccessTokenEnc: encrypt("test-token"),
      updatedAt: new Date(),
    });
    await db.insert(conversations).values({
      id: "c4",
      orgId: "o4",
      phone: "+57300",
      lastMessageAt: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
    });
    await db.insert(orders).values({
      id: "ord-3",
      orgId: "o4",
      conversationId: "c4",
      status: "pendiente",
      totalCop: 100000,
      itemsJson: JSON.stringify([
        { nombre: "Producto A", cantidad: 2, subtotal: 50000 },
        { nombre: "Producto B", cantidad: 1, subtotal: 50000 },
      ]),
      createdAt: new Date(),
    });
    await saveAgentConfig(db, "o4", { checkoutFlowId: "flow-999" });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "m1" }] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "m2" }] }), { status: 200 }),
    );

    const r = await enviarCheckout.run({}, { db, orgId: "o4", conversationId: "c4" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { enviado: boolean; orderId: string };
      expect(data.enviado).toBe(true);
      expect(data.orderId).toBe("ord-3");
    }

    // Verify fetch was called twice (text + flow)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Verify text call
    const textCall = fetchMock.mock.calls[0];
    expect(textCall[0]).toContain("/messages");
    const textBody = JSON.parse(textCall[1]?.body as string);
    expect(textBody.type).toBe("text");
    expect(textBody.text.body).toContain("ord-3");

    // Verify flow call
    const flowCall = fetchMock.mock.calls[1];
    expect(flowCall[0]).toContain("/messages");
    const flowBody = JSON.parse(flowCall[1]?.body as string);
    expect(flowBody.type).toBe("interactive");
    expect(flowBody.interactive.type).toBe("flow");
    expect(flowBody.interactive.action.parameters.flow_id).toBe("flow-999");

    // Ambos mensajes deben quedar en el inbox: resumen y flow de pago
    const out = await db.select().from(messages).where(eq(messages.conversationId, "c4"));
    expect(out).toHaveLength(2);
    expect(out.some((m) => m.type === "text" && (m.body ?? "").includes("ord-3"))).toBe(true);
    expect(out.some((m) => m.type === "interactive")).toBe(true);
  });

  it("resolves order by orderId parameter", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o5", name: "o5", slug: "o5", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o5",
      metaPhoneId: "123",
      metaAccessTokenEnc: encrypt("test-token"),
      updatedAt: new Date(),
    });
    await db.insert(conversations).values({
      id: "c5",
      orgId: "o5",
      phone: "+57300",
      lastMessageAt: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
    });
    await db.insert(orders).values({
      id: "ord-4",
      orgId: "o5",
      conversationId: "c5",
      status: "pendiente",
      totalCop: 75000,
      itemsJson: "[]",
      createdAt: new Date(),
    });
    await saveAgentConfig(db, "o5", { checkoutFlowId: "flow-888" });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "m2" }] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "m3" }] }), { status: 200 }),
    );

    const r = await enviarCheckout.run({ orderId: "ord-4" }, { db, orgId: "o5", conversationId: "c5" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { enviado: boolean; orderId: string };
      expect(data.orderId).toBe("ord-4");
    }
  });

  it("fails when text send fails", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o6", name: "o6", slug: "o6", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o6",
      metaPhoneId: "123",
      metaAccessTokenEnc: encrypt("test-token"),
      updatedAt: new Date(),
    });
    await db.insert(conversations).values({
      id: "c6",
      orgId: "o6",
      phone: "+57300",
      lastMessageAt: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
    });
    await db.insert(orders).values({
      id: "ord-5",
      orgId: "o6",
      conversationId: "c6",
      status: "pendiente",
      totalCop: 50000,
      itemsJson: "[]",
      createdAt: new Date(),
    });
    await saveAgentConfig(db, "o6", { checkoutFlowId: "flow-777" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 400, message: "Invalid number" } }), { status: 400 }),
    );

    const r = await enviarCheckout.run({}, { db, orgId: "o6", conversationId: "c6" });
    expect(r.ok).toBe(false);
  });

  it("funciona con un usuario que solo tiene BSUID, sin teléfono", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o9", name: "o9", slug: "o9", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o9", metaPhoneId: "1234567890", metaWabaId: "w", metaAppId: "a",
      metaAccessTokenEnc: encrypt("t"), metaAppSecretEnc: encrypt("s"), metaVerifyToken: "v",
      forwardUrl: null, optoutKeywords: JSON.stringify(["STOP"]), rateLimitMps: 20,
      defaultCountry: "CO", updatedAt: new Date(),
    });
    await db.insert(conversations).values({
      id: "c9", orgId: "o9", phone: null, bsuid: "US.999", username: "juanda",
      contactId: null, lastMessageAt: new Date(), lastIncomingAt: null, unreadCount: 0,
      status: "open", agentPaused: false, createdAt: new Date(),
    });
    await db.insert(orders).values({
      id: "ord-9", orgId: "o9", conversationId: "c9", status: "pendiente", totalCop: 5000,
      itemsJson: JSON.stringify([{ nombre: "X", cantidad: 1, subtotal: 5000 }]), createdAt: new Date(),
    });
    await saveAgentConfig(db, "o9", { checkoutFlowId: "flow-9" });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ messages: [{ id: "m9" }] }), { status: 200 }));

    const r = await enviarCheckout.run({}, { db, orgId: "o9", conversationId: "c9" });
    expect(r.ok).toBe(true);
    // Debe direccionar por BSUID, no por teléfono
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.recipient).toBe("US.999");
    expect(body.to).toBeUndefined();
  });
});