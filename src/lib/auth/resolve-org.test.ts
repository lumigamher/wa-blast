import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { member, organization, user } from "@/lib/db/schema";
import { resolveOrgForUser } from "./resolve-org";

const now = new Date();

function seed() {
  const { db } = makeTestDb();
  db.insert(user).values([
    { id: "u1", name: "U1", email: "u1@x.co", emailVerified: true, createdAt: now, updatedAt: now },
    { id: "u2", name: "U2", email: "u2@x.co", emailVerified: true, createdAt: now, updatedAt: now },
  ]).run();
  db.insert(organization).values([
    { id: "o1", name: "O1", slug: "o1", createdAt: now },
    { id: "o2", name: "O2", slug: "o2", createdAt: now },
  ]).run();
  return db;
}

describe("resolveOrgForUser", () => {
  it("devuelve la org activa si el usuario sigue siendo miembro", async () => {
    const db = seed();
    db.insert(member).values([
      { id: "m1", organizationId: "o1", userId: "u1", role: "owner", createdAt: now },
      { id: "m2", organizationId: "o2", userId: "u1", role: "member", createdAt: now },
    ]).run();
    expect(await resolveOrgForUser(db as never, "u1", "o2")).toBe("o2");
  });

  it("org activa sin membresía cae a otra membresía del usuario", async () => {
    const db = seed();
    db.insert(member).values([
      { id: "m1", organizationId: "o1", userId: "u1", role: "owner", createdAt: now },
      { id: "m3", organizationId: "o2", userId: "u2", role: "owner", createdAt: now },
    ]).run();
    expect(await resolveOrgForUser(db as never, "u1", "o2")).toBe("o1");
  });

  it("sin org activa usa la primera membresía", async () => {
    const db = seed();
    db.insert(member).values({ id: "m1", organizationId: "o1", userId: "u1", role: "owner", createdAt: now }).run();
    expect(await resolveOrgForUser(db as never, "u1", null)).toBe("o1");
  });

  it("sin membresías devuelve null", async () => {
    const db = seed();
    expect(await resolveOrgForUser(db as never, "u1", "o1")).toBeNull();
    expect(await resolveOrgForUser(db as never, "u1", null)).toBeNull();
  });
});
