import type { CatalogProvider, Product } from "./types";

interface HttpCatalogConfig {
  url: string;
  apiKey?: string;
  nameField?: string;
  priceField?: string;
  idField?: string;
  descField?: string;
}

export function makeHttpCatalog(cfg: HttpCatalogConfig): CatalogProvider {
  const {
    url,
    apiKey,
    idField = "id",
    nameField = "name",
    priceField = "price",
    descField = "description",
  } = cfg;

  return {
    async search({ query, limit = 10 }): Promise<Product[]> {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const params = new URLSearchParams({ q: query });
        const fetchUrl = `${url}?${params}`;
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(fetchUrl, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return [];
        }

        const data = await response.json();
        let items: unknown[] = [];

        if (Array.isArray(data)) {
          items = data;
        } else if (data && typeof data === "object") {
          if ("data" in data && Array.isArray(data.data)) {
            items = data.data;
          } else if ("products" in data && Array.isArray(data.products)) {
            items = data.products;
          }
        }

        return items
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const obj = item as Record<string, unknown>;
            const id = String(obj[idField] ?? "");
            const name = String(obj[nameField] ?? "");
            const priceRaw = obj[priceField];
            const priceCop = Math.round(Number(priceRaw) || 0);
            const description = obj[descField]
              ? String(obj[descField])
              : undefined;

            if (!id || !name) {
              return null;
            }

            return {
              id,
              name,
              priceCop,
              description,
              available: true,
            } as Product;
          })
          .filter((p) => p !== null)
          .slice(0, limit);
      } catch {
        return [];
      }
    },

    async get(id: string): Promise<Product | null> {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const fetchUrl = `${url}/${id}`;
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(fetchUrl, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        let item: unknown = data;

        if (data && typeof data === "object" && "data" in data) {
          item = data.data;
        }

        if (!item || typeof item !== "object") {
          return null;
        }

        const obj = item as Record<string, unknown>;
        const idFieldName = cfg.idField || "id";
        const nameFieldName = cfg.nameField || "name";
        const priceFieldName = cfg.priceField || "price";
        const itemId = String(obj[idFieldName] ?? "");
        const name = String(obj[nameFieldName] ?? "");
        const priceRaw = obj[priceFieldName];
        const priceCop = Math.round(Number(priceRaw) || 0);
        const description = cfg.descField && obj[cfg.descField]
          ? String(obj[cfg.descField])
          : undefined;

        if (!itemId || !name) {
          return null;
        }

        return {
          id: itemId,
          name,
          priceCop,
          description,
          available: true,
        };
      } catch {
        return null;
      }
    },
  };
}
