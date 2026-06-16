import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, contactTags, organization, tags } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";
import {
  createContact,
  updateContact,
  deleteContact,
  setContactTagsForOrg,
  getContact,
} from "@/lib/contacts/mutations";

async function seed(db: DB) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
}

describe("createContact", () => {
  it("normaliza el teléfono y crea el contacto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const res = await createContact(db, "o1", "CO", { phone: "300 123 4567", name: "Juan" });
    expect(res.ok).toBe(true);
    const [c] = await db.select().from(contacts).where(eq(contacts.orgId, "o1"));
    expect(c.phone).toBe("+573001234567");
    expect(c.name).toBe("Juan");
  });

  it("rechaza teléfono inválido", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const res = await createContact(db, "o1", "CO", { phone: "abc" });
    expect(res).toMatchObject({ ok: false });
  });

  it("rechaza email inválido", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const res = await createContact(db, "o1", "CO", { phone: "3001234567", email: "no-es-email" });
    expect(res).toMatchObject({ ok: false });
  });

  it("rechaza duplicado en el mismo org y devuelve existingId", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const a = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const b = await createContact(db, "o1", "CO", { phone: "+573001234567" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.existingId).toBe((a as { ok: true; id: string }).id);
  });

  it("permite el mismo teléfono en otro org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await createContact(db, "o1", "CO", { phone: "3001234567" });
    const res = await createContact(db, "o2", "CO", { phone: "3001234567" });
    expect(res.ok).toBe(true);
  });
});

describe("updateContact", () => {
  it("aplica patch parcial y mergea customFields", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    await updateContact(db, "o1", id, { customFields: { a: "1" } });
    await updateContact(db, "o1", id, { company: "ACME", customFields: { b: "2" } });
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(row.company).toBe("ACME");
    expect(JSON.parse(row.customFields)).toEqual({ a: "1", b: "2" });
  });

  it("no actualiza contactos de otro org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    const res = await updateContact(db, "o2", id, { name: "Hack" });
    expect(res.ok).toBe(false);
  });
});

describe("deleteContact", () => {
  it("borra el contacto y sus tags (cascade)", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    await db.insert(tags).values({ id: "t1", orgId: "o1", name: "VIP", color: "#fff" });
    await setContactTagsForOrg(db, "o1", id, ["t1"]);
    await deleteContact(db, "o1", id);
    const rows = await db.select().from(contacts).where(eq(contacts.id, id));
    const tagRows = await db.select().from(contactTags).where(eq(contactTags.contactId, id));
    expect(rows).toHaveLength(0);
    expect(tagRows).toHaveLength(0);
  });
});

describe("setContactTagsForOrg", () => {
  it("reemplaza el set y descarta tags de otro org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    await db.insert(tags).values({ id: "t1", orgId: "o1", name: "VIP", color: "#fff" });
    await db.insert(tags).values({ id: "tX", orgId: "o2", name: "Ajeno", color: "#000" });
    await setContactTagsForOrg(db, "o1", id, ["t1", "tX"]);
    const tagRows = await db.select().from(contactTags).where(eq(contactTags.contactId, id));
    expect(tagRows.map((r) => r.tagId)).toEqual(["t1"]);
  });
});

describe("getContact", () => {
  it("devuelve null si no es del org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c = await createContact(db, "o1", "CO", { phone: "3001234567" });
    const id = (c as { ok: true; id: string }).id;
    expect(await getContact(db, "o2", id)).toBeNull();
    const found = await getContact(db, "o1", id);
    expect(found?.tagList).toEqual([]);
  });
});
