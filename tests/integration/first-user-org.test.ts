import { describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, member, user } from "@/lib/db/schema";
import { assignFirstUserToDefaultOrg } from "@/lib/auth/hooks";

describe("first-user-wins", () => {
  test("creates default org and makes user owner when no org exists", async () => {
    const { db } = makeTestDb();
    const userId = "u1";
    await db.insert(user).values({
      id: userId,
      email: "a@b.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assignFirstUserToDefaultOrg(db, userId);

    const orgs = await db.select().from(organization);
    const members = await db.select().from(member);
    expect(orgs).toHaveLength(1);
    expect(orgs[0].slug).toBe("default");
    expect(members[0].userId).toBe(userId);
    expect(members[0].role).toBe("owner");
  });

  test("does not create a second org if one already exists", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "Existing", slug: "default", createdAt: new Date() });
    await db.insert(user).values({
      id: "u1",
      email: "a@b.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assignFirstUserToDefaultOrg(db, "u1");

    const orgs = await db.select().from(organization);
    expect(orgs).toHaveLength(1);
  });
});
