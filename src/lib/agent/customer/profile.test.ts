import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, organization } from "@/lib/db/schema";
import { saveContactFacts } from "./profile";

async function seed(db: any) {
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
