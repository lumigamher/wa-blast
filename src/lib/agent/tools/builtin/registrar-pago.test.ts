import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messages, orders, organization } from "@/lib/db/schema";
import { registrarPago as registrarPagoTool } from "./registrar-pago";

describe("registrar_pago", () => {
  it("marks pending order as pagado when found by conversationId", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    // Insert a pending order
    await db.insert(orders).values({
      id: "ord1",
      orgId: "o1",
      conversationId: "c1",
      status: "pendiente",
      totalCop: 10000,
      createdAt: new Date(),
    });

    const r = await registrarPagoTool.run(
      { medioDePago: "Nequi" },
      { db, orgId: "o1", conversationId: "c1" },
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { orderId: string };
      expect(data.orderId).toBe("ord1");
    }

    // Verify order is now pagado
    const [updated] = await db.select().from(orders).where(eq(orders.id, "ord1"));
    expect(updated.status).toBe("pagado");
    expect(updated.paymentMethod).toBe("Nequi");
  });

  it("uses explicit orderId if provided", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c2", orgId: "o2", phone: "+57301", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    await db.insert(orders).values({
      id: "ord2",
      orgId: "o2",
      conversationId: "c2",
      status: "pendiente",
      totalCop: 5000,
      createdAt: new Date(),
    });

    const r = await registrarPagoTool.run(
      { medioDePago: "Daviplata", orderId: "ord2" },
      { db, orgId: "o2", conversationId: "c2" },
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { orderId: string };
      expect(data.orderId).toBe("ord2");
    }

    const [updated] = await db.select().from(orders).where(eq(orders.id, "ord2"));
    expect(updated.status).toBe("pagado");
    expect(updated.paymentMethod).toBe("Daviplata");
  });

  it("attaches latest inbound media as comprobante", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o3", name: "o3", slug: "o3", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c3", orgId: "o3", phone: "+57302", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    await db.insert(orders).values({
      id: "ord3",
      orgId: "o3",
      conversationId: "c3",
      status: "pendiente",
      totalCop: 8000,
      createdAt: new Date(),
    });

    // Insert an inbound message with a media
    await db.insert(messages).values({
      id: "msg1",
      orgId: "o3",
      conversationId: "c3",
      direction: "in",
      mediaId: "media_abc123",
      type: "image",
      createdAt: new Date(),
    });

    const r = await registrarPagoTool.run(
      { medioDePago: "Transferencia" },
      { db, orgId: "o3", conversationId: "c3" },
    );

    expect(r.ok).toBe(true);

    const [updated] = await db.select().from(orders).where(eq(orders.id, "ord3"));
    expect(updated.status).toBe("pagado");
    expect(updated.paymentMethod).toBe("Transferencia");
    expect(updated.comprobanteMediaId).toBe("media_abc123");
  });

  it("fails when no pending order found", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o4", name: "o4", slug: "o4", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c4", orgId: "o4", phone: "+57303", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    const r = await registrarPagoTool.run(
      { medioDePago: "Nequi" },
      { db, orgId: "o4", conversationId: "c4" },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("No hay un pedido pendiente");
    }
  });

  it("ignores non-pending orders when finding by conversationId", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o5", name: "o5", slug: "o5", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c5", orgId: "o5", phone: "+57304", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    // Insert a pagado order (not pending)
    await db.insert(orders).values({
      id: "ord5_paid",
      orgId: "o5",
      conversationId: "c5",
      status: "pagado",
      totalCop: 5000,
      createdAt: new Date(),
    });

    const r = await registrarPagoTool.run(
      { medioDePago: "Nequi" },
      { db, orgId: "o5", conversationId: "c5" },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("No hay un pedido pendiente");
    }
  });

  it("multi-tenant: can only see pending orders from same org", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "oa", name: "oa", slug: "oa", createdAt: new Date() });
    await db.insert(conversations).values({ id: "ca", orgId: "oa", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    await db.insert(organization).values({ id: "ob", name: "ob", slug: "ob", createdAt: new Date() });
    await db.insert(conversations).values({ id: "cb", orgId: "ob", phone: "+57301", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    // Create pending orders in both orgs, both in same conversation IDs
    await db.insert(orders).values({
      id: "ord_a",
      orgId: "oa",
      conversationId: "ca",
      status: "pendiente",
      totalCop: 5000,
      createdAt: new Date(),
    });
    await db.insert(orders).values({
      id: "ord_b",
      orgId: "ob",
      conversationId: "cb",
      status: "pendiente",
      totalCop: 5000,
      createdAt: new Date(),
    });

    // When org B tries to find pending order without specifying ID,
    // it should find ord_b (its own), not ord_a
    const r = await registrarPagoTool.run(
      { medioDePago: "Nequi" },
      { db, orgId: "ob", conversationId: "cb" },
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { orderId: string };
      expect(data.orderId).toBe("ord_b");
    }

    // Verify ord_a is still pending (not touched)
    const [ordA] = await db.select().from(orders).where(eq(orders.id, "ord_a"));
    expect(ordA.status).toBe("pendiente");
  });
});
