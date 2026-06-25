import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, conversations, organization } from "@/lib/db/schema";
import { recopilarDatos } from "./recopilar-datos";

describe("recopilar_datos", () => {
  it("devuelve los campos guardados incluso sin contacto", async () => {
    const { db } = makeTestDb();
    const r = await recopilarDatos.run(
      { campos: { nombre: "Ana", ciudad: "Cali" } },
      { db, orgId: "o1", conversationId: "conv-sin-contacto" },
    );
    expect(r).toEqual({
      ok: true,
      data: { guardados: ["nombre", "ciudad"] },
    });
  });

  it("persiste en el contacto de la conversación", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o1", name: "O", slug: "o1", createdAt: new Date() })
      .onConflictDoNothing();
    await db
      .insert(contacts)
      .values({ id: "ct1", orgId: "o1", phone: "57300", createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoNothing();
    await db
      .insert(conversations)
      .values({
        id: "conv1",
        orgId: "o1",
        phone: "57300",
        status: "open",
        unreadCount: 0,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        contactId: "ct1",
      })
      .onConflictDoNothing();

    const r = await recopilarDatos.run({ campos: { nombre: "Ana", segmento: "mayorista" } }, { db, orgId: "o1", conversationId: "conv1" });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ guardados: ["nombre", "segmento"] });
    }

    const [c] = await db.select().from(contacts).where(and(eq(contacts.id, "ct1"), eq(contacts.orgId, "o1")));
    expect(c.name).toBe("Ana");
    expect(JSON.parse(c.dataJson)).toMatchObject({ segmento: "mayorista" });
  });
});
