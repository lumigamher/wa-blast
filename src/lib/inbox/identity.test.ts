import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, conversations, organization } from "@/lib/db/schema";
import { getOrCreateConversationByIdentity } from "./identity";

const TS = new Date("2026-08-13T10:00:00Z");

async function seedOrg(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("getOrCreateConversationByIdentity", () => {
  it("crea contacto y conversación cuando solo llega el BSUID", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    const conv = await getOrCreateConversationByIdentity(
      db,
      "o1",
      { bsuid: "US.123", username: "juanda" },
      TS,
      "Juan",
    );
    expect(conv.bsuid).toBe("US.123");
    expect(conv.phone).toBeNull();
    const [c] = await db.select().from(contacts).where(eq(contacts.orgId, "o1"));
    expect(c.bsuid).toBe("US.123");
    expect(c.username).toBe("juanda");
    expect(c.phone).toBeNull();
    expect(c.name).toBe("Juan");
  });

  it("no duplica cuando el mismo BSUID vuelve a escribir", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    const a = await getOrCreateConversationByIdentity(db, "o1", { bsuid: "US.123" }, TS);
    const b = await getOrCreateConversationByIdentity(db, "o1", { bsuid: "US.123" }, TS);
    expect(b.id).toBe(a.id);
    expect(await db.select().from(contacts).where(eq(contacts.orgId, "o1"))).toHaveLength(1);
  });

  it("le pega el BSUID al contacto que ya existía por teléfono, sin duplicarlo", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    // Cliente de siempre, conocido solo por teléfono
    const previo = await getOrCreateConversationByIdentity(db, "o1", { phone: "+57300" }, TS);
    // Ahora adopta username y Meta manda ambos
    const ahora = await getOrCreateConversationByIdentity(
      db,
      "o1",
      { phone: "+57300", bsuid: "US.123", username: "juanda" },
      TS,
    );
    expect(ahora.id).toBe(previo.id);
    expect(ahora.bsuid).toBe("US.123");
    const todos = await db.select().from(contacts).where(eq(contacts.orgId, "o1"));
    expect(todos).toHaveLength(1);
    expect(todos[0].bsuid).toBe("US.123");
    expect(todos[0].phone).toBe("+57300");
  });

  it("tras la vinculación lo encuentra aunque Meta ya no mande el teléfono", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    const previo = await getOrCreateConversationByIdentity(
      db,
      "o1",
      { phone: "+57300", bsuid: "US.123" },
      TS,
    );
    const soloBsuid = await getOrCreateConversationByIdentity(db, "o1", { bsuid: "US.123" }, TS);
    expect(soloBsuid.id).toBe(previo.id);
    expect(await db.select().from(conversations).where(eq(conversations.orgId, "o1"))).toHaveLength(1);
  });

  it("NUNCA borra un teléfono conocido porque Meta deje de mandarlo", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    await getOrCreateConversationByIdentity(db, "o1", { phone: "+57300", bsuid: "US.123" }, TS);
    const conv = await getOrCreateConversationByIdentity(db, "o1", { bsuid: "US.123" }, TS);
    expect(conv.phone).toBe("+57300");
    const [c] = await db.select().from(contacts).where(eq(contacts.orgId, "o1"));
    expect(c.phone).toBe("+57300");
  });

  it("completa el teléfono y el username si llegan después", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    await getOrCreateConversationByIdentity(db, "o1", { bsuid: "US.123" }, TS);
    await getOrCreateConversationByIdentity(
      db,
      "o1",
      { bsuid: "US.123", phone: "+57300", username: "juanda" },
      TS,
    );
    const [c] = await db.select().from(contacts).where(eq(contacts.orgId, "o1"));
    expect(c.phone).toBe("+57300");
    expect(c.username).toBe("juanda");
  });

  it("no mezcla identidades entre organizaciones", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    const a = await getOrCreateConversationByIdentity(db, "o1", { bsuid: "US.123" }, TS);
    const b = await getOrCreateConversationByIdentity(db, "o2", { bsuid: "US.123" }, TS);
    expect(b.id).not.toBe(a.id);
  });

  it("exige al menos una identidad", async () => {
    const { db } = makeTestDb();
    await seedOrg(db);
    await expect(getOrCreateConversationByIdentity(db, "o1", {}, TS)).rejects.toThrow(/identidad/i);
  });
});
