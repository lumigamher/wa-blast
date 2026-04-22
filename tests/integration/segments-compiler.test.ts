import { describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, contactTags, organization, tags } from "@/lib/db/schema";
import { runSegment } from "@/lib/segments/query";

async function seed() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  await db.insert(tags).values({ id: "t1", orgId: "o", name: "vip", color: "#000" });
  await db.insert(tags).values({ id: "t2", orgId: "o", name: "lead", color: "#000" });
  await db.insert(contacts).values([
    {
      id: "c1",
      orgId: "o",
      phone: "+57300",
      name: "A",
      customFields: JSON.stringify({ city: "Bogota" }),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "c2",
      orgId: "o",
      phone: "+57301",
      name: "B",
      customFields: JSON.stringify({ city: "Medellin" }),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "c3",
      orgId: "o",
      phone: "+57302",
      name: "C",
      customFields: JSON.stringify({ city: "Cali" }),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "c4",
      orgId: "o",
      phone: "+57303",
      name: "D opted-out",
      customFields: "{}",
      optOutAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  await db.insert(contactTags).values([
    { contactId: "c1", tagId: "t1" },
    { contactId: "c2", tagId: "t1" },
    { contactId: "c3", tagId: "t2" },
    { contactId: "c4", tagId: "t1" },
  ]);
  return { db };
}

describe("runSegment", () => {
  test("tag=vip AND city in [Bogota, Medellin] — excludes opt-out", async () => {
    const { db } = await seed();
    const result = await runSegment(db, "o", {
      combinator: "AND",
      conditions: [
        { field: "tag", op: "in", value: ["vip"] },
        {
          combinator: "OR",
          conditions: [
            { field: "custom.city", op: "eq", value: "Bogota" },
            { field: "custom.city", op: "eq", value: "Medellin" },
          ],
        },
      ],
    });
    expect(result.map((r) => r.phone).sort()).toEqual(["+57300", "+57301"]);
  });

  test("always excludes opt-out even when rule matches them", async () => {
    const { db } = await seed();
    const result = await runSegment(db, "o", {
      combinator: "AND",
      conditions: [{ field: "tag", op: "in", value: ["vip"] }],
    });
    expect(result.find((r) => r.name === "D opted-out")).toBeUndefined();
  });
});
