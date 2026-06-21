import type { CatalogProvider, Product } from "./types";

interface ShopifyCatalogConfig {
  shop: string;
  storefrontToken: string;
}

export function makeShopifyCatalog(cfg: ShopifyCatalogConfig): CatalogProvider {
  const { shop, storefrontToken } = cfg;

  // Build endpoint URL
  const shopName = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  const endpoint = `https://${shopName}/api/2025-01/graphql.json`;

  const headers = {
    "X-Shopify-Storefront-Access-Token": storefrontToken,
    "Content-Type": "application/json",
  };

  async function mapProductNode(node: any): Promise<Product | null> {
    if (!node || typeof node !== "object") {
      return null;
    }

    const id = node.id ? String(node.id) : "";
    const name = node.title ? String(node.title) : "";
    const description = node.description ? String(node.description) : undefined;
    const available = node.availableForSale === true;

    // Extract price from variants
    const variantPrice = node.variants?.edges?.[0]?.node?.price?.amount;
    const priceCop = variantPrice
      ? Math.round(Number(variantPrice) || 0)
      : 0;

    if (!id || !name) {
      return null;
    }

    return {
      id,
      name,
      priceCop,
      description,
      available,
    };
  }

  return {
    async search({ query, limit = 10 }): Promise<Product[]> {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const searchQuery = `query($q: String, $first: Int!) {
          products(first: $first, query: $q) {
            edges {
              node {
                id
                title
                description
                availableForSale
                variants(first: 1) {
                  edges {
                    node {
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }`;

        const variables = {
          q: `title:*${query}*`,
          first: limit,
        };

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: searchQuery, variables }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return [];
        }

        const data = await response.json();

        // Check for GraphQL errors
        if (data.errors) {
          return [];
        }

        const edges = data.data?.products?.edges || [];
        const products: Product[] = [];

        for (const edge of edges) {
          const product = await mapProductNode(edge.node);
          if (product) {
            products.push(product);
          }
        }

        return products;
      } catch {
        return [];
      }
    },

    async get(id: string): Promise<Product | null> {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const getQuery = `query($id: ID!) {
          product(id: $id) {
            id
            title
            description
            availableForSale
            variants(first: 1) {
              edges {
                node {
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }`;

        const variables = { id };

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: getQuery, variables }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return null;
        }

        const data = await response.json();

        // Check for GraphQL errors
        if (data.errors) {
          return null;
        }

        const product = data.data?.product;
        if (!product) {
          return null;
        }

        return mapProductNode(product);
      } catch {
        return null;
      }
    },
  };
}
