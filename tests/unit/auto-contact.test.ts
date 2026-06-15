import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, organization } from "@/lib/db/schema";
import { getOrCreateConversation } from "@/lib/inbox/store";
import type { DB } from "@/lib/db/client";

async function seed(db: DB) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("auto contacto", () => {
  it("crea contacto en el primer entrante con profile name", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const conv = await getOrCreateConversation(db, "o1", "+57300", new Date(), "Camila");
    const c = (await db.select().from(contacts).where(eq(contacts.id, conv.contactId!)))[0];
    expect(c.name).toBe("Camila");
    expect(c.phone).toBe("+57300");
  });

  it("no pisa un nombre puesto a mano", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "+57300", name: "Mi Nombre", customFields: "{}", createdAt: new Date(), updatedAt: new Date() });
    const conv = await getOrCreateConversation(db, "o1", "+57300", new Date(), "Camila");
    const c = (await db.select().from(contacts).where(eq(contacts.id, conv.contactId!)))[0];
    expect(c.name).toBe("Mi Nombre");
  });

  it("rellena nombre si el contacto existía sin nombre", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "+57300", name: null, customFields: "{}", createdAt: new Date(), updatedAt: new Date() });
    const conv = await getOrCreateConversation(db, "o1", "+57300", new Date(), "Camila");
    const c = (await db.select().from(contacts).where(eq(contacts.id, conv.contactId!)))[0];
    expect(c.name).toBe("Camila");
  });
});
