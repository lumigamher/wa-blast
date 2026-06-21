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
});
