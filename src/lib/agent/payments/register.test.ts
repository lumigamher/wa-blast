import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, contacts, orders, messages } from "@/lib/db/schema";
import { registrarPago } from "./register";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({
    id: "o1",
    name: "o1",
    slug: "o1",
    createdAt: new Date(),
  });
  await db.insert(conversations).values({
    id: "c1",
    orgId: "o1",
    phone: "+57300",
    lastMessageAt: new Date(),
    unreadCount: 0,
    createdAt: new Date(),
  });
  await db.insert(contacts).values({
    id: "ct1",
    orgId: "o1",
    phone: "+57300",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(orders).values({
    id: "ord1",
    orgId: "o1",
    conversationId: "c1",
    contactId: "ct1",
    itemsJson: "[]",
    totalCop: 50000,
    status: "pendiente",
    createdAt: new Date(),
  });
}

describe("registrarPago", () => {
  it("registers payment with comprobante media", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const mediaId = "media123";
    await db.insert(messages).values({
      id: "msg1",
      conversationId: "c1",
      orgId: "o1",
      direction: "in",
      type: "image",
      mediaId: mediaId,
      body: "",
      createdAt: new Date(),
    });
    const result = await registrarPago(db, {
      orgId: "o1",
      conversationId: "c1",
      medioDePago: "Nequi",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok: true");
    expect(result.orderId).toBe("ord1");
    const updated = await db.select().from(orders);
    expect(updated[0].status).toBe("pagado");
    expect(updated[0].paymentMethod).toBe("Nequi");
    expect(updated[0].comprobanteMediaId).toBe(mediaId);
  });

  it("no pending order returns error", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.update(orders).set({ status: "pagado" });
    const result = await registrarPago(db, {
      orgId: "o1",
      conversationId: "c1",
      medioDePago: "Nequi",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok: false");
    expect(result.error).toBe("No hay un pedido pendiente en esta conversación");
  });

  it("with explicit orderId uses that order", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(orders).values({
      id: "ord2",
      orgId: "o1",
      conversationId: "c1",
      contactId: "ct1",
      itemsJson: "[]",
      totalCop: 100000,
      status: "pendiente",
      createdAt: new Date(),
    });
    const result = await registrarPago(db, {
      orgId: "o1",
      conversationId: "c1",
      orderId: "ord2",
      medioDePago: "Transferencia",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok: true");
    expect(result.orderId).toBe("ord2");
    const ord1 = (await db.select().from(orders).where(eq(orders.id, "ord1")))[0];
    const ord2 = (await db.select().from(orders).where(eq(orders.id, "ord2")))[0];
    expect(ord1.status).toBe("pendiente");
    expect(ord2.status).toBe("pagado");
  });
  it("con orderId de otra org o de otra conversación: error y pedido intacto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c2", orgId: "o1", phone: "+57301", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    await db.insert(conversations).values({ id: "c9", orgId: "o2", phone: "+57309", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    const base = { contactId: null, itemsJson: "[]", totalCop: 1, status: "pendiente" as const, createdAt: new Date() };
    await db.insert(orders).values({ id: "otra-conv", orgId: "o1", conversationId: "c2", ...base });
    await db.insert(orders).values({ id: "otra-org", orgId: "o2", conversationId: "c9", ...base });
    for (const orderId of ["otra-conv", "otra-org"]) {
      const r = await registrarPago(db, { orgId: "o1", conversationId: "c1", orderId, medioDePago: "Nequi" });
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("Expected ok: false");
      expect(r.error).toBe("No hay un pedido pendiente en esta conversación");
      const row = (await db.select().from(orders).where(eq(orders.id, orderId)))[0];
      expect(row.status).toBe("pendiente");
      expect(row.paymentMethod).toBeNull();
    }
  });
});
