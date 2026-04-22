import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, organization } from "@/lib/db/schema";
import { upsertContacts } from "@/lib/contacts/upsert";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  return "o";
}

describe("upsertContacts", () => {
  test("inserts new, preserves opt_out on duplicate", async () => {
    const { db } = makeTestDb();
    const orgId = await seed(db);

    await db.insert(contacts).values({
      id: "c1",
      orgId,
      phone: "+573001234567",
      name: "Old",
      customFields: "{}",
      optOutAt: new Date("2025-01-01"),
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    });

    const result = await upsertContacts(db, orgId, [
      { phone: "+573001234567", name: "New Name", customFields: { city: "Bucaramanga" } },
      { phone: "+573009999999", name: "Brand New" },
    ]);

    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(1);

    const [kept] = await db.select().from(contacts).where(eq(contacts.phone, "+573001234567"));
    expect(kept.name).toBe("New Name");
    expect(kept.optOutAt).not.toBeNull();
    expect(JSON.parse(kept.customFields).city).toBe("Bucaramanga");
  });
});
