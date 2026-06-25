import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, conversations, orders, organization } from "@/lib/db/schema";
import { saveContactFacts, buildCustomerProfile } from "./profile";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db
    .insert(organization)
    .values({ id: "o1", name: "O", slug: "o1", createdAt: new Date() })
    .onConflictDoNothing();
  await db
    .insert(contacts)
    .values({ id: "c1", orgId: "o1", phone: "57300", createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoNothing();
}

describe("saveContactFacts", () => {
  it("mapea campos conocidos a columnas y desconocidos a data_json", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await saveContactFacts(db, "o1", "c1", { nombre: "Ana", ciudad: "Cali", segmento: "mayorista" });
    const [c] = await db.select().from(contacts).where(and(eq(contacts.id, "c1"), eq(contacts.orgId, "o1")));
    expect(c.name).toBe("Ana");
    expect(c.city).toBe("Cali");
    expect(JSON.parse(c.dataJson)).toMatchObject({ segmento: "mayorista" });
  });

  it("no pisa con vacío y mergea data_json", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await saveContactFacts(db, "o1", "c1", { segmento: "mayorista" });
    await saveContactFacts(db, "o1", "c1", { nombre: "", horario: "después de las 6" });
    const [c] = await db.select().from(contacts).where(eq(contacts.id, "c1"));
    expect(c.name).toBeFalsy();
    expect(JSON.parse(c.dataJson)).toMatchObject({ segmento: "mayorista", horario: "después de las 6" });
  });

  it("no rompe si el contacto no existe / otra org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await expect(saveContactFacts(db, "o1", "nope", { x: "1" })).resolves.toBeUndefined();
    await saveContactFacts(db, "OTRA", "c1", { nombre: "X" });
    const [c] = await db.select().from(contacts).where(eq(contacts.id, "c1"));
    expect(c.name).toBeFalsy(); // org distinta no escribe
  });
});

describe("buildCustomerProfile", () => {
  it("arma la ficha desde contacto + pedidos", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await saveContactFacts(db, "o1", "c1", { nombre: "Ana", segmento: "mayorista" });
    await db
      .insert(conversations)
      .values({
        id: "cv1",
        orgId: "o1",
        phone: "57300",
        status: "open",
        unreadCount: 0,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        contactId: "c1",
      })
      .onConflictDoNothing();
    await db
      .insert(orders)
      .values({
        id: "ord_ABC123",
        orgId: "o1",
        contactId: "c1",
        itemsJson: "[]",
        totalCop: 99000,
        status: "pagado",
        paymentMethod: "Nequi",
        shippingAddressJson: JSON.stringify({ direccion: "Cl 1 #2-3", ciudad: "Cali" }),
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    const ficha = await buildCustomerProfile(db, "o1", "cv1");
    expect(ficha).toContain("Ana");
    expect(ficha).toContain("mayorista");
    expect(ficha).toContain("Cali");
    expect(ficha).toContain("Nequi");
    expect(ficha.toUpperCase()).toContain("ABC123");
  });

  it("ficha vacía si la conversación no tiene contacto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db
      .insert(conversations)
      .values({
        id: "cv2",
        orgId: "o1",
        phone: "57301",
        status: "open",
        unreadCount: 0,
        lastMessageAt: new Date(),
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    expect(await buildCustomerProfile(db, "o1", "cv2")).toBe("");
  });
});
