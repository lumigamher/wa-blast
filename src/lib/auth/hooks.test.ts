import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { invitation, member, organization, user } from "@/lib/db/schema";
import { settleInvitationIfAlreadyMember } from "./hooks";

async function seed(alreadyMember: boolean) {
  const { db } = makeTestDb();
  const now = new Date();
  await db.insert(organization).values({ id: "o1", name: "O", slug: "o1", createdAt: now });
  await db.insert(user).values([
    { id: "u1", email: "u1@x.co", createdAt: now, updatedAt: now },
    { id: "u2", email: "u2@x.co", createdAt: now, updatedAt: now },
  ]);
  await db.insert(member).values({ id: "m-owner", organizationId: "o1", userId: "u1", role: "owner", createdAt: now });
  if (alreadyMember) {
    await db.insert(member).values({ id: "m2", organizationId: "o1", userId: "u2", role: "member", createdAt: now });
  }
  await db.insert(invitation).values({
    id: "inv1", organizationId: "o1", email: "u2@x.co", role: "member", status: "pending",
    expiresAt: new Date(Date.now() + 86_400_000), inviterId: "u1",
  });
  return db;
}

describe("settleInvitationIfAlreadyMember", () => {
  it("ya miembro: marca la invitación aceptada, devuelve true y no duplica el miembro", async () => {
    const db = await seed(true);
    expect(await settleInvitationIfAlreadyMember(db, { invitationId: "inv1", organizationId: "o1", userId: "u2" })).toBe(true);
    const [inv] = await db.select().from(invitation).where(eq(invitation.id, "inv1"));
    expect(inv.status).toBe("accepted");
    expect(await db.select().from(member).where(eq(member.userId, "u2"))).toHaveLength(1);
  });

  it("no miembro: devuelve false y deja la invitación pendiente para better-auth", async () => {
    const db = await seed(false);
    expect(await settleInvitationIfAlreadyMember(db, { invitationId: "inv1", organizationId: "o1", userId: "u2" })).toBe(false);
    const [inv] = await db.select().from(invitation).where(eq(invitation.id, "inv1"));
    expect(inv.status).toBe("pending");
  });
});
