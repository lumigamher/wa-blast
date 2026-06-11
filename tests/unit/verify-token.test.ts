import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, organizationSettings } from "@/lib/db/schema";
import { ensureVerifyToken } from "@/lib/org/settings";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(organizationSettings).values({ orgId: "o1", updatedAt: new Date() });
}

describe("ensureVerifyToken", () => {
  it("genera token si falta y es idempotente", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const t1 = await ensureVerifyToken(db, "o1");
    expect(t1).toMatch(/^lula_[0-9a-f]{16}$/);
    const t2 = await ensureVerifyToken(db, "o1");
    expect(t2).toBe(t1); // no regenera
  });
});
