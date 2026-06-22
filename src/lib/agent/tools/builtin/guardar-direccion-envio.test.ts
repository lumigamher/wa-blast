import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, orders } from "@/lib/db/schema";
import { getLatestOrderForConversation } from "@/lib/agent/catalog/orders";
import { guardarDireccionEnvio } from "./guardar-direccion-envio";

describe("guardar_direccion_envio", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeEach(async () => {
    db = makeTestDb().db;
    await db
      .insert(organization)
      .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db
      .insert(conversations)
      .values({
        id: "c1",
        orgId: "o1",
        phone: "57300",
        lastMessageAt: new Date(),
        createdAt: new Date(),
      });
    await db.insert(orders).values({
      id: "ord1",
      orgId: "o1",
      conversationId: "c1",
      itemsJson: "[]",
      totalCop: 1000,
      createdAt: new Date(),
    });
  });

  it("guarda la dirección estructurada en el pedido", async () => {
    const res = await guardarDireccionEnvio.run(
      {
        destinatario: "Ana",
        telefono: "3001112233",
        departamento: "Cundinamarca",
        ciudad: "Bogotá",
        direccion: "Cra 1 #2-3",
        barrio: "Centro",
      },
      { db, orgId: "o1", conversationId: "c1" }
    );
    expect(res.ok).toBe(true);
    const order = await getLatestOrderForConversation(db, "o1", "c1");
    const addr = JSON.parse(order!.shippingAddressJson as string);
    expect(addr.ciudad).toBe("Bogotá");
    expect(addr.destinatario).toBe("Ana");
  });

  it("sin pedido → error", async () => {
    const res = await guardarDireccionEnvio.run(
      {
        destinatario: "Ana",
        telefono: "3001112233",
        departamento: "X",
        ciudad: "Y",
        direccion: "Z",
      },
      { db, orgId: "o1", conversationId: "cX" }
    );
    expect(res.ok).toBe(false);
  });
});
