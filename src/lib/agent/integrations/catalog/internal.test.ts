import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, products } from "@/lib/db/schema";
import { makeInternalCatalog } from "./internal";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(products).values([
    { id: "p1", orgId: "o1", name: "Cerveza Aguila", priceCop: 2500, available: true, createdAt: new Date() },
    { id: "p2", orgId: "o1", name: "Agua Cristal", priceCop: 1500, available: true, createdAt: new Date() },
    { id: "p3", orgId: "o1", name: "Cerveza Club Colombia", priceCop: 3000, available: false, createdAt: new Date() },
  ]);
}

describe("internal catalog", () => {
  it("busca por nombre (case-insensitive), solo disponibles", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const cat = makeInternalCatalog(db, "o1");
    const res = await cat.search({ query: "cerveza" });
    expect(res.map((p) => p.id)).toEqual(["p1"]); // p3 no disponible
    expect(res[0].priceCop).toBe(2500);
  });
  it("get devuelve el producto o null", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const cat = makeInternalCatalog(db, "o1");
    expect((await cat.get("p2"))?.name).toBe("Agua Cristal");
    expect(await cat.get("nope")).toBeNull();
  });
});
