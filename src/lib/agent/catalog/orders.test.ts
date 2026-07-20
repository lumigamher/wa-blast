import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { eq } from "drizzle-orm";
import { organization, orders, conversations, contacts } from "@/lib/db/schema";
import { createOrder, getLatestOrderForConversation, setOrderShipping, listOrders, countOrders, getOrder, updateOrderStatus, setOrderDispatched } from "./orders";
import type { CatalogProvider, Product } from "@/lib/agent/integrations/catalog/types";

const PRODS: Record<string, Product> = {
  p1: { id: "p1", name: "Cerveza", priceCop: 2500, available: true },
  p2: { id: "p2", name: "Agua", priceCop: 1500, available: true },
  p3: {
    id: "p3",
    name: "Camiseta",
    priceCop: 20000,
    available: true,
    variants: [
      { id: "v1", label: "Talla L", priceCop: 25000, available: true },
      { id: "v2", label: "Talla M", priceCop: 22000, available: true },
    ],
  },
};
const fakeProvider: CatalogProvider = {
  async search() { return []; },
  async get(id) { return PRODS[id] ?? null; },
};

describe("createOrder", () => {
  it("reusa el pedido pendiente en vez de duplicar", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "cv1", orgId: "o1", phone: "57300", lastMessageAt: new Date(), createdAt: new Date() });

    // Primer pedido: crea con numero 1, status pendiente
    const r1 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 1 }] }, fakeProvider);
    expect(r1.numero).toBe(1);
    expect(r1.totalCop).toBe(2500);

    // Segundo pedido (misma conversación, sigue pendiente): actualiza el mismo
    const r2 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 3 }] }, fakeProvider);
    expect(r2.orderId).toBe(r1.orderId);
    expect(r2.numero).toBe(r1.numero);
    expect(r2.totalCop).toBe(7500); // 3 × 2500

    const all = await listOrders(db, "o1", {});
    expect(all.length).toBe(1);
    expect(all[0].totalCop).toBe(r2.totalCop); // refleja la 2da (3 unidades)
  });

  it("crea pedido nuevo (numero+1) si el último ya no está pendiente", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "cv1", orgId: "o1", phone: "57300", lastMessageAt: new Date(), createdAt: new Date() });

    const r1 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 1 }] }, fakeProvider);
    expect(r1.numero).toBe(1);

    // Cambiar estado a pagado
    await updateOrderStatus(db, "o1", r1.orderId, "pagado");

    // Nuevo pedido: debe ser diferente, numero=2
    const r2 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 1 }] }, fakeProvider);
    expect(r2.orderId).not.toBe(r1.orderId);
    expect(r2.numero).toBe((r1.numero ?? 0) + 1);
    expect(r2.numero).toBe(2);
  });

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
  it("variante seleccionada: usa precio y etiqueta de la variante", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const r = await createOrder(
      db,
      { orgId: "o1", items: [{ productId: "p3", cantidad: 2, variantId: "v1" }] },
      fakeProvider
    );
    expect(r.totalCop).toBe(50000); // 2 × 25000
    const [row] = await db.select().from(orders).where(eq(orders.orgId, "o1"));
    const items = JSON.parse(row.itemsJson);
    expect(items[0]).toMatchObject({
      productId: "p3",
      nombre: "Camiseta",
      precioUnitario: 25000,
      variantId: "v1",
      variantLabel: "Talla L",
      cantidad: 2,
      subtotal: 50000,
    });
  });
  it("variante no encontrada → throw", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await expect(
      createOrder(
        db,
        { orgId: "o1", items: [{ productId: "p3", cantidad: 1, variantId: "v_inexistente" }] },
        fakeProvider
      )
    ).rejects.toThrow("Variante no encontrada: v_inexistente");
  });
  it("producto inexistente → throw", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await expect(createOrder(db, { orgId: "o2", items: [{ productId: "nope", cantidad: 1 }] }, fakeProvider)).rejects.toThrow();
  });
});

describe("createOrder herencia de dirección", () => {
  it("un pedido nuevo hereda la dirección del último pedido del contacto", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "+57300", createdAt: new Date(), updatedAt: new Date() });
    await db.insert(conversations).values({ id: "cv1", orgId: "o1", phone: "+57300", contactId: "ct1", lastMessageAt: new Date(), createdAt: new Date() });

    const r1 = await createOrder(db, { orgId: "o1", conversationId: "cv1", contactId: "ct1", items: [{ productId: "p1", cantidad: 1 }] }, fakeProvider);
    const addr = JSON.stringify({ direccion: "Calle 1 #2-3", ciudad: "Bogotá" });
    await setOrderShipping(db, "o1", r1.orderId, { addressJson: addr });
    await updateOrderStatus(db, "o1", r1.orderId, "pagado");

    const r2 = await createOrder(db, { orgId: "o1", conversationId: "cv1", contactId: "ct1", items: [{ productId: "p2", cantidad: 2 }] }, fakeProvider);
    expect(r2.orderId).not.toBe(r1.orderId);
    const nuevo = await getOrder(db, "o1", r2.orderId);
    expect(nuevo?.shippingAddressJson).toBe(addr);
  });

  it("sin pedidos previos con dirección, el pedido nace sin dirección", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "+57300", createdAt: new Date(), updatedAt: new Date() });
    await db.insert(conversations).values({ id: "cv1", orgId: "o1", phone: "+57300", contactId: "ct1", lastMessageAt: new Date(), createdAt: new Date() });

    const r = await createOrder(db, { orgId: "o1", conversationId: "cv1", contactId: "ct1", items: [{ productId: "p1", cantidad: 1 }] }, fakeProvider);
    const nuevo = await getOrder(db, "o1", r.orderId);
    expect(nuevo?.shippingAddressJson).toBeNull();
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
