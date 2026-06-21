import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getCatalogConfig, saveCatalogConfig, type CatalogConfig } from "./config";

describe("catalog config", () => {
  it("guarda config con credenciales cifradas", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });

    const input: CatalogConfig = {
      provider: "http",
      credentials: { apiKey: "secreta-api-key" },
      config: { url: "https://example.com/api" },
    };
    await saveCatalogConfig(db, "o1", input);

    const retrieved = await getCatalogConfig(db, "o1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.provider).toBe("http");
    expect(retrieved?.credentials.apiKey).toBe("secreta-api-key");
    expect(retrieved?.config.url).toBe("https://example.com/api");
  });

  it("credenciales encriptadas no son legibles en DB", async () => {
    const { db, sqlite } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });

    const input: CatalogConfig = {
      provider: "http",
      credentials: { apiKey: "secreta-api-key" },
      config: { url: "https://example.com/api" },
    };
    await saveCatalogConfig(db, "o1", input);

    const row = sqlite
      .prepare("SELECT credentials_enc FROM agent_catalog WHERE org_id = 'o1'")
      .get() as { credentials_enc: string | null };
    expect(row.credentials_enc).toBeDefined();
    // Verificar que la cadena encriptada NO contiene la clave en texto plano
    expect(row.credentials_enc).not.toContain("secreta-api-key");
  });

  it("config sin credenciales funciona", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });

    const input: CatalogConfig = {
      provider: "internal",
      credentials: {},
      config: {},
    };
    await saveCatalogConfig(db, "o2", input);

    const retrieved = await getCatalogConfig(db, "o2");
    expect(retrieved?.provider).toBe("internal");
    expect(retrieved?.credentials).toEqual({});
    expect(retrieved?.config).toEqual({});
  });

  it("getCatalogConfig retorna null si no existe", async () => {
    const { db } = makeTestDb();
    const retrieved = await getCatalogConfig(db, "o-inexistente");
    expect(retrieved).toBeNull();
  });

  it("actualiza config existente", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });

    const input1: CatalogConfig = {
      provider: "http",
      credentials: { apiKey: "key1" },
      config: { url: "https://v1.com" },
    };
    await saveCatalogConfig(db, "o1", input1);

    const input2: CatalogConfig = {
      provider: "shopify",
      credentials: { storefrontToken: "token2" },
      config: { shop: "shop.myshopify.com" },
    };
    await saveCatalogConfig(db, "o1", input2);

    const retrieved = await getCatalogConfig(db, "o1");
    expect(retrieved?.provider).toBe("shopify");
    expect(retrieved?.credentials.storefrontToken).toBe("token2");
    expect(retrieved?.config.shop).toBe("shop.myshopify.com");
  });
});
