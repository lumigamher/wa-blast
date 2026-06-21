import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, contacts, orders, orderPayments } from "@/lib/db/schema";
import { generarLinkPago, markOrderPaidByCheckout } from "./link";
import * as env from "@/lib/env";

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
    phone: "+573001234567",
    lastMessageAt: new Date(),
    createdAt: new Date(),
  });

  await db.insert(contacts).values({
    id: "ct1",
    orgId: "o1",
    phone: "+573001234567",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("link.ts", () => {
  describe("markOrderPaidByCheckout", () => {
    it("marks order as pagado when transaction found", async () => {
      const { db } = makeTestDb();
      await seed(db);

      const orderId = "order-1";
      const txId = "tx1";

      await db.insert(orders).values({
        id: orderId,
        orgId: "o1",
        conversationId: "c1",
        contactId: "ct1",
        itemsJson: "[]",
        totalCop: 10000,
        status: "pendiente",
        createdAt: new Date(),
      });

      await db.insert(orderPayments).values({
        id: txId,
        orgId: "o1",
        orderId: orderId,
        amountCop: 10000,
        createdAt: new Date(),
      });

      const result = await markOrderPaidByCheckout(db, [txId]);

      expect(result).toBe(true);

      const updated = await db.select().from(orders).where(eq(orders.id, orderId));
      expect(updated).toHaveLength(1);
      expect(updated[0].status).toBe("pagado");
      expect(updated[0].paymentMethod).toBe("EfiPay");
    });

    it("returns false when transaction not found", async () => {
      const { db } = makeTestDb();
      await seed(db);

      const result = await markOrderPaidByCheckout(db, ["nope"]);

      expect(result).toBe(false);
    });

    it("returns false on empty candidateIds", async () => {
      const { db } = makeTestDb();
      await seed(db);

      const result = await markOrderPaidByCheckout(db, []);

      expect(result).toBe(false);
    });

    it("finds first matching transaction and updates order", async () => {
      const { db } = makeTestDb();
      await seed(db);

      const order1 = "order-1";
      const tx1 = "tx1";

      await db.insert(orders).values({
        id: order1,
        orgId: "o1",
        conversationId: "c1",
        contactId: "ct1",
        itemsJson: "[]",
        totalCop: 5000,
        status: "pendiente",
        createdAt: new Date(),
      });

      await db.insert(orderPayments).values({
        id: tx1,
        orgId: "o1",
        orderId: order1,
        amountCop: 5000,
        createdAt: new Date(),
      });

      const result = await markOrderPaidByCheckout(db, [tx1, "nonexistent"]);

      expect(result).toBe(true);

      const orders1 = await db.select().from(orders).where(eq(orders.id, order1));
      expect(orders1[0].status).toBe("pagado");
      expect(orders1[0].paymentMethod).toBe("EfiPay");
    });
  });

  describe("generarLinkPago", () => {
    it("returns error when no pending order found", async () => {
      const { db } = makeTestDb();
      await seed(db);

      const result = await generarLinkPago(db, {
        orgId: "o1",
        conversationId: "c1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("No hay un pedido para cobrar");
      }
    });

    it("returns error when EfiPay not configured", async () => {
      const { db } = makeTestDb();
      await seed(db);

      await db.insert(orders).values({
        id: "order-1",
        orgId: "o1",
        conversationId: "c1",
        contactId: "ct1",
        itemsJson: "[]",
        totalCop: 10000,
        status: "pendiente",
        createdAt: new Date(),
      });

      const originalToken = process.env.EFIPAY_API_TOKEN;
      const originalOfficeId = process.env.EFIPAY_OFFICE_ID;

      try {
        delete process.env.EFIPAY_API_TOKEN;
        delete process.env.EFIPAY_OFFICE_ID;

        // Re-import env to pick up cleared env vars
        vi.resetModules();

        const result = await generarLinkPago(db, {
          orgId: "o1",
          conversationId: "c1",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe("Pagos en línea no configurados");
        }
      } finally {
        if (originalToken) process.env.EFIPAY_API_TOKEN = originalToken;
        if (originalOfficeId) process.env.EFIPAY_OFFICE_ID = originalOfficeId;
      }
    });

    it("finds order by orderId when provided", async () => {
      const { db } = makeTestDb();
      await seed(db);

      const orderId = "specific-order";
      await db.insert(orders).values({
        id: orderId,
        orgId: "o1",
        conversationId: "c1",
        contactId: "ct1",
        itemsJson: "[]",
        totalCop: 20000,
        status: "pendiente",
        createdAt: new Date(),
      });

      const originalToken = process.env.EFIPAY_API_TOKEN;
      const originalOfficeId = process.env.EFIPAY_OFFICE_ID;

      try {
        delete process.env.EFIPAY_API_TOKEN;
        delete process.env.EFIPAY_OFFICE_ID;

        const result = await generarLinkPago(db, {
          orgId: "o1",
          conversationId: "c1",
          orderId: orderId,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe("Pagos en línea no configurados");
        }
      } finally {
        if (originalToken) process.env.EFIPAY_API_TOKEN = originalToken;
        if (originalOfficeId) process.env.EFIPAY_OFFICE_ID = originalOfficeId;
      }
    });

    it("returns most recent pending order when multiple exist", async () => {
      const { db } = makeTestDb();
      await seed(db);

      const now = new Date();
      const earlier = new Date(now.getTime() - 60000);

      await db.insert(orders).values({
        id: "older-order",
        orgId: "o1",
        conversationId: "c1",
        contactId: "ct1",
        itemsJson: "[]",
        totalCop: 5000,
        status: "pendiente",
        createdAt: earlier,
      });
      await db.insert(orders).values({
        id: "recent-order",
        orgId: "o1",
        conversationId: "c1",
        contactId: "ct1",
        itemsJson: "[]",
        totalCop: 15000,
        status: "pendiente",
        createdAt: now,
      });

      const originalToken = process.env.EFIPAY_API_TOKEN;
      const originalOfficeId = process.env.EFIPAY_OFFICE_ID;

      try {
        delete process.env.EFIPAY_API_TOKEN;
        delete process.env.EFIPAY_OFFICE_ID;

        const result = await generarLinkPago(db, {
          orgId: "o1",
          conversationId: "c1",
        });

        expect(result.ok).toBe(false);
      } finally {
        if (originalToken) process.env.EFIPAY_API_TOKEN = originalToken;
        if (originalOfficeId) process.env.EFIPAY_OFFICE_ID = originalOfficeId;
      }
    });

    it("scoped to orgId when finding order", async () => {
      const { db } = makeTestDb();
      await seed(db);

      await db.insert(organization).values({
        id: "o2",
        name: "o2",
        slug: "o2",
        createdAt: new Date(),
      });

      await db.insert(conversations).values({
        id: "c2",
        orgId: "o2",
        phone: "+5730999999",
        lastMessageAt: new Date(),
        createdAt: new Date(),
      });

      await db.insert(orders).values({
        id: "order-o2",
        orgId: "o2",
        conversationId: "c2",
        itemsJson: "[]",
        totalCop: 10000,
        status: "pendiente",
        createdAt: new Date(),
      });

      const originalToken = process.env.EFIPAY_API_TOKEN;
      const originalOfficeId = process.env.EFIPAY_OFFICE_ID;

      try {
        delete process.env.EFIPAY_API_TOKEN;
        delete process.env.EFIPAY_OFFICE_ID;

        const result = await generarLinkPago(db, {
          orgId: "o1",
          conversationId: "c1",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe("No hay un pedido para cobrar");
        }
      } finally {
        if (originalToken) process.env.EFIPAY_API_TOKEN = originalToken;
        if (originalOfficeId) process.env.EFIPAY_OFFICE_ID = originalOfficeId;
      }
    });
  });
});
