import type { DB } from "@/lib/db/client";
import { makeHttpCatalog } from "./http";
import { makeInternalCatalog } from "./internal";
import { makeMedusaCatalog } from "./medusa";
import { makeShopifyCatalog } from "./shopify";
import type { CatalogProvider } from "./types";

export type CatalogResolveInput = {
  provider: "internal" | "http" | "shopify" | "medusa";
  db: DB;
  orgId: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export function getCatalogProvider(input: CatalogResolveInput): CatalogProvider {
  switch (input.provider) {
    case "internal":
      return makeInternalCatalog(input.db, input.orgId);
    case "http":
      return makeHttpCatalog({
        url: String(input.config.url ?? ""),
        apiKey: input.credentials.apiKey,
        nameField: input.config.nameField as string | undefined,
        priceField: input.config.priceField as string | undefined,
        idField: input.config.idField as string | undefined,
        descField: input.config.descField as string | undefined,
      });
    case "shopify":
      return makeShopifyCatalog({
        shop: String(input.config.shop ?? ""),
        storefrontToken: input.credentials.storefrontToken ?? "",
      });
    case "medusa":
      return makeMedusaCatalog({
        backendUrl: String(input.config.backendUrl ?? ""),
        publishableKey: input.credentials.publishableKey ?? "",
        regionId: input.config.regionId ? String(input.config.regionId) : undefined,
      });
    default:
      throw new Error(`Provider de catálogo no soportado: ${input.provider}`);
  }
}
