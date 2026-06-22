import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, orders, products } from "@/lib/db/schema";
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
});
