import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, orders, products, productVariants } from "@/lib/db/schema";
import { saveShippingConfig } from "@/lib/agent/integrations/shipping/config";
import { cotizarEnvio } from "./cotizar-envio";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db
    .insert(organization)
    .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db
    .insert(conversations)
    .values({ id: "c1", orgId: "o1", phone: "57300", lastMessageAt: new Date(), createdAt: new Date() });
  await db.insert(products).values({
    id: "p1",
    orgId: "o1",
    name: "Camisa",
    priceCop: 20000,
    available: true,
    weightGrams: 500,
    lengthCm: 20,
    widthCm: 20,
    heightCm: 5,
    createdAt: new Date(),
  });
  await db.insert(orders).values({
    id: "ord1",
    orgId: "o1",
    conversationId: "c1",
    itemsJson: JSON.stringify([{ productId: "p1", cantidad: 2 }]),
    totalCop: 40000,
    createdAt: new Date(),
  });
}

describe("cotizar_envio", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeEach(async () => {
    db = makeTestDb().db;
    await seed(db);
  });

  it("cotiza con tabla manual y devuelve barata+rápida", async () => {
    await saveShippingConfig(db, "o1", {
      provider: "manual",
      credentials: {},
      config: {
        originCityName: "Medellín",
        volumetricFactor: 2500,
        rates: [{ maxWeightKg: 5, priceCop: 12000, deliveryDays: 3 }],
      },
    });
    const res = await cotizarEnvio.run(
      { ciudadDestino: "Bogotá" },
      { db, orgId: "o1", conversationId: "c1" }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { opciones: Array<{ priceCop: number }> };
      expect(data.opciones.length).toBeGreaterThan(0);
      expect(data.opciones[0].priceCop).toBe(12000);
    }
  });

  it("falta peso/dims → error claro", async () => {
    await db.update(products).set({ weightGrams: null }).where(eq(products.id, "p1"));
    await saveShippingConfig(db, "o1", {
      provider: "manual",
      credentials: {},
      config: { rates: [{ maxWeightKg: 5, priceCop: 1 }] },
    });
    const res = await cotizarEnvio.run(
      { ciudadDestino: "Bogotá" },
      { db, orgId: "o1", conversationId: "c1" }
    );
    expect(res.ok).toBe(false);
  });

  it("sin config de envíos → error", async () => {
    const res = await cotizarEnvio.run(
      { ciudadDestino: "Bogotá" },
      { db, orgId: "o1", conversationId: "c1" }
    );
    expect(res.ok).toBe(false);
  });

  it("no cotiza con productos de otra org (aislamiento)", async () => {
    await saveShippingConfig(db, "o1", {
      provider: "manual",
      credentials: {},
      config: { rates: [{ maxWeightKg: 5, priceCop: 12000 }] },
    });
    await db
      .insert(organization)
      .values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(products).values({
      id: "p2",
      orgId: "o2",
      name: "Ajeno",
      priceCop: 1,
      available: true,
      weightGrams: 100,
      lengthCm: 5,
      widthCm: 5,
      heightCm: 5,
      createdAt: new Date(),
    });
    // El pedido de o1 intenta referenciar el producto de o2.
    await db
      .update(orders)
      .set({ itemsJson: JSON.stringify([{ productId: "p2", cantidad: 1 }]) })
      .where(eq(orders.id, "ord1"));
    const res = await cotizarEnvio.run(
      { ciudadDestino: "Bogotá" },
      { db, orgId: "o1", conversationId: "c1" }
    );
    expect(res.ok).toBe(false); // no debe ver el producto de o2
  });

  it("usa peso/dims de la variante cuando está presente", async () => {
    // Crear producto con peso base 500g
    await db.update(products).set({ weightGrams: 500 }).where(eq(products.id, "p1"));
    // Crear variante más pesada (2000g)
    await db.insert(productVariants).values({
      id: "v1",
      productId: "p1",
      orgId: "o1",
      label: "Talla grande",
      available: true,
      weightGrams: 2000, // Variante más pesada
      lengthCm: 30, // Variante más larga
      widthCm: 20,
      heightCm: 5,
      createdAt: new Date(),
    });
    // Actualizar orden para referenciar la variante
    await db.update(orders).set({
      itemsJson: JSON.stringify([{ productId: "p1", cantidad: 1, variantId: "v1" }]),
    }).where(eq(orders.id, "ord1"));

    await saveShippingConfig(db, "o1", {
      provider: "manual",
      credentials: {},
      config: {
        originCityName: "Medellín",
        volumetricFactor: 2500,
        rates: [
          { maxWeightKg: 1.5, priceCop: 5000 }, // Hasta 1.5kg
          { maxWeightKg: 5, priceCop: 12000 }, // Hasta 5kg
        ],
      },
    });
    const res = await cotizarEnvio.run(
      { ciudadDestino: "Bogotá" },
      { db, orgId: "o1", conversationId: "c1" }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { pesoFacturableKg: number; opciones: Array<{ priceCop: number }> };
      // 2kg (variante) > 1.5kg, así que debe usar la tarifa de 5kg (12000)
      expect(data.pesoFacturableKg).toBeGreaterThan(1.5);
      expect(data.opciones[0].priceCop).toBe(12000);
    }
  });

  it("variante sin peso cae back a peso del producto", async () => {
    // Crear variante sin peso especificado (heredará del producto)
    await db.insert(productVariants).values({
      id: "v2",
      productId: "p1",
      orgId: "o1",
      label: "Color rojo",
      available: true,
      weightGrams: null, // Sin peso en variante → usa del producto
      lengthCm: null, // Sin dims en variante → usa del producto
      widthCm: null,
      heightCm: null,
      createdAt: new Date(),
    });
    await db.update(orders).set({
      itemsJson: JSON.stringify([{ productId: "p1", cantidad: 1, variantId: "v2" }]),
    }).where(eq(orders.id, "ord1"));

    await saveShippingConfig(db, "o1", {
      provider: "manual",
      credentials: {},
      config: {
        originCityName: "Medellín",
        volumetricFactor: 2500,
        rates: [{ maxWeightKg: 5, priceCop: 12000 }],
      },
    });
    const res = await cotizarEnvio.run(
      { ciudadDestino: "Bogotá" },
      { db, orgId: "o1", conversationId: "c1" }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { pesoFacturableKg: number; opciones: Array<{ priceCop: number }> };
      // Debe usar el peso del producto (500g actual en p1 seed, volumétrico es 20*20*5/2500=0.8kg)
      expect(data.pesoFacturableKg).toBeGreaterThan(0);
      expect(data.opciones[0].priceCop).toBe(12000);
    }
  });
});
