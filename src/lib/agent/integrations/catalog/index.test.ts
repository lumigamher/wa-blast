import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { getCatalogProvider, type CatalogResolveInput } from "./index";

describe("getCatalogProvider", () => {
  it("resuelve internal catalog", () => {
    const { db } = makeTestDb();
    const input: CatalogResolveInput = {
      provider: "internal",
      db,
      orgId: "o1",
      credentials: {},
      config: {},
    };
    const provider = getCatalogProvider(input);
    expect(provider).toBeDefined();
    expect(typeof provider.search).toBe("function");
    expect(typeof provider.get).toBe("function");
  });

  it("resuelve http catalog con config", () => {
    const { db } = makeTestDb();
    const input: CatalogResolveInput = {
      provider: "http",
      db,
      orgId: "o1",
      credentials: { apiKey: "test-key" },
      config: {
        url: "https://api.example.com/products",
        nameField: "title",
        priceField: "price",
      },
    };
    const provider = getCatalogProvider(input);
    expect(provider).toBeDefined();
    expect(typeof provider.search).toBe("function");
    expect(typeof provider.get).toBe("function");
  });

  it("resuelve shopify catalog con credenciales", () => {
    const { db } = makeTestDb();
    const input: CatalogResolveInput = {
      provider: "shopify",
      db,
      orgId: "o1",
      credentials: { storefrontToken: "test-token" },
      config: { shop: "test-shop.myshopify.com" },
    };
    const provider = getCatalogProvider(input);
    expect(provider).toBeDefined();
    expect(typeof provider.search).toBe("function");
    expect(typeof provider.get).toBe("function");
  });

  it("provider desconocido lanza error", () => {
    const { db } = makeTestDb();
    const input: CatalogResolveInput = {
      provider: "unknown" as any,
      db,
      orgId: "o1",
      credentials: {},
      config: {},
    };
    expect(() => getCatalogProvider(input)).toThrow("Provider de catálogo no soportado");
  });
});
