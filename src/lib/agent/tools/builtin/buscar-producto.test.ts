import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, products } from "@/lib/db/schema";
import { saveCatalogConfig } from "../../integrations/catalog/config";
import { buscarProducto } from "./buscar-producto";

describe("buscar_producto", () => {
  it("busca en catálogo interno configurado", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(products).values({ id: "p1", orgId: "o1", name: "Cerveza Aguila", priceCop: 2500, available: true, createdAt: new Date() });
    await saveCatalogConfig(db, "o1", { provider: "internal", credentials: {}, config: {} });
    const r = await buscarProducto.run({ query: "cerveza" }, { db, orgId: "o1", conversationId: "c1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { productos: { name: string }[] };
      expect(data.productos[0].name).toBe("Cerveza Aguila");
    }
  });

  it("sin catálogo configurado → ok:false", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    const r = await buscarProducto.run({ query: "x" }, { db, orgId: "o2", conversationId: "c1" });
    expect(r.ok).toBe(false);
  });
});
