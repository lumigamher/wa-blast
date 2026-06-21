import { describe, expect, it } from "vitest";
import { asc } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization, paymentMethods } from "@/lib/db/schema";
import { addPaymentMethod, setPaymentMethodEnabled, listPaymentMethods } from "../../payments/methods";
import { mediosDePago } from "./medios-de-pago";

describe("medios_de_pago", () => {
  it("returns empty data when no payment methods enabled", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    const r = await mediosDePago.run({}, { db, orgId: "o1", conversationId: "c1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { metodos: Array<{ type: string; label: string; details: string }> };
      expect(data.metodos).toEqual([]);
    }
  });

  it("returns enabled payment methods with their details", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c2", orgId: "o2", phone: "+57301", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    await addPaymentMethod(db, "o2", { type: "nequi", label: "Nequi (móvil)", details: "3157000000" });
    await addPaymentMethod(db, "o2", { type: "daviplata", label: "DaviPlata", details: "312XXXX" });

    const r = await mediosDePago.run({}, { db, orgId: "o2", conversationId: "c2" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { metodos: Array<{ type: string; label: string; details: string }> };
      expect(data.metodos).toHaveLength(2);
      expect(data.metodos[0]).toEqual({
        type: "nequi",
        label: "Nequi (móvil)",
        details: "3157000000",
      });
      expect(data.metodos[1]).toEqual({
        type: "daviplata",
        label: "DaviPlata",
        details: "312XXXX",
      });
    }
  });

  it("only returns enabled payment methods (excludes disabled)", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o3", name: "o3", slug: "o3", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c3", orgId: "o3", phone: "+57302", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    // Add 2 methods
    await addPaymentMethod(db, "o3", { type: "nequi", label: "Nequi", details: "3157000000" });
    await addPaymentMethod(db, "o3", { type: "transferencia", label: "Transferencia", details: "XXXX-XXXX" });

    // Get all methods to find the IDs
    const allMethods = await listPaymentMethods(db, "o3", false);
    expect(allMethods).toHaveLength(2);
    const [nequiMethod, transferenciaMethod] = allMethods;

    // Disable the second one
    await setPaymentMethodEnabled(db, "o3", transferenciaMethod.id, false);

    const r = await mediosDePago.run({}, { db, orgId: "o3", conversationId: "c3" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { metodos: Array<{ type: string; label: string; details: string }> };
      expect(data.metodos).toHaveLength(1);
      expect(data.metodos[0].type).toBe("nequi");
    }
  });

  it("multi-tenant: returns only payment methods for that org", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "oa", name: "oa", slug: "oa", createdAt: new Date() });
    await db.insert(conversations).values({ id: "ca", orgId: "oa", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    await db.insert(organization).values({ id: "ob", name: "ob", slug: "ob", createdAt: new Date() });
    await db.insert(conversations).values({ id: "cb", orgId: "ob", phone: "+57301", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });

    await addPaymentMethod(db, "oa", { type: "nequi", label: "Nequi A", details: "111" });
    await addPaymentMethod(db, "ob", { type: "daviplata", label: "DaviPlata B", details: "222" });

    const ra = await mediosDePago.run({}, { db, orgId: "oa", conversationId: "ca" });
    const rb = await mediosDePago.run({}, { db, orgId: "ob", conversationId: "cb" });

    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    if (ra.ok && rb.ok) {
      const dataA = ra.data as { metodos: Array<{ type: string; label: string; details: string }> };
      const dataB = rb.data as { metodos: Array<{ type: string; label: string; details: string }> };
      expect(dataA.metodos).toHaveLength(1);
      expect(dataA.metodos[0].type).toBe("nequi");
      expect(dataB.metodos).toHaveLength(1);
      expect(dataB.metodos[0].type).toBe("daviplata");
    }
  });
});
