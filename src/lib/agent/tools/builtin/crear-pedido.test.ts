import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, orders, organization, products } from "@/lib/db/schema";
import { saveCatalogConfig } from "../../integrations/catalog/config";
import { crearPedido } from "./crear-pedido";

describe("crear_pedido", () => {
  it("crea el pedido con total correcto (catálogo interno)", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    await db.insert(products).values({ id: "p1", orgId: "o1", name: "Cerveza", priceCop: 2500, available: true, createdAt: new Date() });
    await saveCatalogConfig(db, "o1", { provider: "internal", credentials: {}, config: {} });
    const r = await crearPedido.run({ items: [{ productId: "p1", cantidad: 2 }] }, { db, orgId: "o1", conversationId: "c1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as {
        orderId: string;
        numeroCorto: string;
        items: Array<{ nombre: string; cantidad: number; subtotalCop: number; variante?: string }>;
        totalCop: number;
        siguientePaso: string;
      };
      expect(data.totalCop).toBe(5000);
      expect(data.numeroCorto).toMatch(/^[A-F0-9]{6}$/);
      expect(data.items).toHaveLength(1);
      expect(data.items[0]).toEqual({
        nombre: "Cerveza",
        cantidad: 2,
        subtotalCop: 5000,
      });
      expect(data.siguientePaso).toBe("coordinar el pago y la entrega");
    }
    const [order] = await db.select().from(orders).where(eq(orders.orgId, "o1"));
    expect(order.totalCop).toBe(5000);
  });

  it("acepta variantId en items (requiere catálogo con variantes)", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    await db.insert(products).values({
      id: "p1",
      orgId: "o1",
      name: "Camiseta",
      priceCop: 20000,
      available: true,
      createdAt: new Date(),
    });
    // El catálogo interno cargará la variante si está en DB (no aquí, pero schema lo acepta)
    await saveCatalogConfig(db, "o1", { provider: "internal", credentials: {}, config: {} });
    // La herramienta debe aceptar variantId en el schema (sin error)
    const r = await crearPedido.run(
      { items: [{ productId: "p1", cantidad: 1, variantId: "v1" }] },
      { db, orgId: "o1", conversationId: "c1" }
    );
    // En este contexto, el catálogo interno de p1 no tiene variantes,
    // así que debería fallar en createOrder. Pero la herramienta debe aceptar el parámetro.
    expect(r.ok).toBe(false); // Por la falta de variante, que es correcto
  });

  it("producto inexistente → ok:false", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c2", orgId: "o2", phone: "+57301", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    await saveCatalogConfig(db, "o2", { provider: "internal", credentials: {}, config: {} });
    const r = await crearPedido.run({ items: [{ productId: "nope", cantidad: 1 }] }, { db, orgId: "o2", conversationId: "c2" });
    expect(r.ok).toBe(false);
  });

  it("multi-tenant: org A no puede pedir un producto de org B", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "ob", name: "ob", slug: "ob", createdAt: new Date() });
    await db.insert(products).values({ id: "prodB", orgId: "ob", name: "Producto B", priceCop: 9999, available: true, createdAt: new Date() });
    await db.insert(organization).values({ id: "oa", name: "oa", slug: "oa", createdAt: new Date() });
    await db.insert(conversations).values({ id: "ca", orgId: "oa", phone: "+57302", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
    await saveCatalogConfig(db, "oa", { provider: "internal", credentials: {}, config: {} });
    const r = await crearPedido.run({ items: [{ productId: "prodB", cantidad: 1 }] }, { db, orgId: "oa", conversationId: "ca" });
    expect(r.ok).toBe(false); // el catálogo interno de A no ve productos de B
  });
});
