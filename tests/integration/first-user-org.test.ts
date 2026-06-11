import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { member, organization, user, organizationSettings } from "@/lib/db/schema";
import { createOrgForNewUser } from "@/lib/auth/hooks";
import type { DB } from "@/lib/db/client";

async function seedUser(db: DB, id: string, email: string) {
  await db.insert(user).values({
    id,
    email,
    name: email.split("@")[0],
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id, email, name: email.split("@")[0] };
}

describe("createOrgForNewUser", () => {
  it("cada usuario nuevo obtiene su propia org como owner", async () => {
    const { db } = makeTestDb();
    const u1 = await seedUser(db, "u1", "ana@negocio.co");
    const u2 = await seedUser(db, "u2", "luis@otro.co");
    await createOrgForNewUser(db, u1);
    await createOrgForNewUser(db, u2);
    const orgs = await db.select().from(organization);
    expect(orgs.length).toBe(2);
    const m1 = (await db.select().from(member).where(eq(member.userId, "u1")))[0];
    const m2 = (await db.select().from(member).where(eq(member.userId, "u2")))[0];
    expect(m1.role).toBe("owner");
    expect(m2.role).toBe("owner");
    expect(m1.organizationId).not.toBe(m2.organizationId);
  });

  it("slugs colisionan → sufijo único", async () => {
    const { db } = makeTestDb();
    const a = await seedUser(db, "a", "ana@uno.com");
    const b = await seedUser(db, "b", "ana@dos.com");
    await createOrgForNewUser(db, a);
    await createOrgForNewUser(db, b);
    const orgs = await db.select().from(organization);
    const slugs = orgs.map((o) => o.slug).filter((s): s is string => s !== null);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs.every((s: string) => s.startsWith("ana"))).toBe(true);
  });

  it("crea organizationSettings con defaults para la org nueva", async () => {
    const { db } = makeTestDb();
    const u = await seedUser(db, "u3", "pepe@x.co");
    await createOrgForNewUser(db, u);
    const org = (await db.select().from(organization))[0];
    const settings = (await db.select().from(organizationSettings).where(eq(organizationSettings.orgId, org.id)))[0];
    expect(settings).toBeTruthy();
  });

  it("es idempotente si el usuario ya tiene org", async () => {
    const { db } = makeTestDb();
    const u = await seedUser(db, "u4", "rep@x.co");
    await createOrgForNewUser(db, u);
    await createOrgForNewUser(db, u);
    expect((await db.select().from(organization)).length).toBe(1);
  });
});
