import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { eq } from "drizzle-orm";
import { organization, orders, conversations, contacts } from "@/lib/db/schema";
import { createOrder, getLatestOrderForConversation, setOrderShipping, listOrders, countOrders, getOrder, updateOrderStatus, setOrderDispatched } from "./orders";
import type { CatalogProvider, Product } from "@/lib/agent/integrations/catalog/types";

const PRODS: Record<string, Product> = {
  p1: { id: "p1", name: "Cerveza", priceCop: 2500, available: true },
  p2: { id: "p2", name: "Agua", priceCop: 1500, available: true },
};
const fakeProvider: CatalogProvider = {
  async search() { return []; },
  async get(id) { return PRODS[id] ?? null; },
};

describe("createOrder", () => {
  it("resuelve productos, congela precios y crea el pedido", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const r = await createOrder(db, { orgId: "o1", items: [{ productId: "p1", cantidad: 2 }, { productId: "p2", cantidad: 1 }] }, fakeProvider);
    expect(r.totalCop).toBe(6500);
    const [row] = await db.select().from(orders).where(eq(orders.orgId, "o1"));
    expect(row.totalCop).toBe(6500);
    expect(row.status).toBe("pendiente");
    const items = JSON.parse(row.itemsJson);
    expect(items[0]).toMatchObject({ productId: "p1", nombre: "Cerveza", precioUnitario: 2500, cantidad: 2, subtotal: 5000 });
  });
  it("producto inexistente → throw", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await expect(createOrder(db, { orgId: "o2", items: [{ productId: "nope", cantidad: 1 }] }, fakeProvider)).rejects.toThrow();
  });
});

describe("orders shipping helpers", () => {
  it("recupera el último pedido de la conversación y guarda envío", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "57300", lastMessageAt: new Date(), createdAt: new Date() });
    await db.insert(orders).values({ id: "ord1", orgId: "o1", conversationId: "c1", itemsJson: "[]", totalCop: 1000, createdAt: new Date(Date.now() - 1000) });
    await db.insert(orders).values({ id: "ord2", orgId: "o1", conversationId: "c1", itemsJson: "[]", totalCop: 2000, createdAt: new Date() });
    expect((await getLatestOrderForConversation(db, "o1", "c1"))?.id).toBe("ord2");
    await setOrderShipping(db, "o1", "ord2", { addressJson: '{"ciudad":"Bogotá"}', quoteJson: '{"carrier":"X"}' });
    const after = await getLatestOrderForConversation(db, "o1", "c1");
    expect(after?.shippingAddressJson).toContain("Bogotá");
    expect(after?.shippingQuoteJson).toContain("X");
  });
});

describe("listOrders / countOrders", () => {
  it("lista con cliente, filtra por estado y pagina", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "57300", name: "Ana", customFields: "{}", createdAt: new Date(), updatedAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "57300", contactId: "ct1", lastMessageAt: new Date(), createdAt: new Date() });
    await db.insert(orders).values({ id: "ord1", orgId: "o1", conversationId: "c1", contactId: "ct1", itemsJson: "[]", totalCop: 1000, status: "pagado", shippingAddressJson: '{"ciudad":"Bogotá"}', createdAt: new Date(Date.now() - 1000) });
    await db.insert(orders).values({ id: "ord2", orgId: "o1", conversationId: "c1", contactId: "ct1", itemsJson: "[]", totalCop: 2000, status: "pendiente", createdAt: new Date() });

    const all = await listOrders(db, "o1");
    expect(all.length).toBe(2);
    expect(all[0].id).toBe("ord2");
    const ana = all.find((o) => o.id === "ord1")!;
    expect(ana.contactName).toBe("Ana");
    expect(ana.phone).toBe("57300");
    expect(ana.shippingCity).toBe("Bogotá");

    const pagados = await listOrders(db, "o1", { status: "pagado" });
    expect(pagados.map((o) => o.id)).toEqual(["ord1"]);
    expect(await countOrders(db, "o1")).toBe(2);
    expect(await countOrders(db, "o1", { status: "pagado" })).toBe(1);
    const page = await listOrders(db, "o1", { limit: 1, offset: 0 });
    expect(page.length).toBe(1);
  });
});

describe("getOrder / updateOrderStatus / setOrderDispatched", () => {
  it("lee, cambia estado y marca despachado, scoped por org", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(orders).values({ id: "ord1", orgId: "o1", itemsJson: "[]", totalCop: 1000, status: "pendiente", createdAt: new Date() });

    const got = await getOrder(db, "o1", "ord1");
    expect(got?.id).toBe("ord1");
    expect(await getOrder(db, "o2", "ord1")).toBeNull();

    await updateOrderStatus(db, "o1", "ord1", "pagado");
    expect((await getOrder(db, "o1", "ord1"))?.status).toBe("pagado");
    await expect(updateOrderStatus(db, "o1", "ord1", "inexistente" as never)).rejects.toThrow();

    await setOrderDispatched(db, "o1", "ord1", true);
    expect((await getOrder(db, "o1", "ord1"))?.dispatchedAt).toBeTruthy();
    await setOrderDispatched(db, "o1", "ord1", false);
    expect((await getOrder(db, "o1", "ord1"))?.dispatchedAt).toBeNull();
  });
});
