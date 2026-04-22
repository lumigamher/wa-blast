import { describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";

describe("test db", () => {
  test("can create an organization", async () => {
    const { db } = makeTestDb();
    const id = "org_1";
    await db.insert(organization).values({
      id,
      name: "Test Org",
      createdAt: new Date(),
    });
    const rows = await db.select().from(organization);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Test Org");
  });
});
