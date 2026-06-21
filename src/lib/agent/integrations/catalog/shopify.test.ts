import { describe, expect, it, vi } from "vitest";
import { makeShopifyCatalog } from "./shopify";

describe("shopify catalog", () => {
  it("search mapea GraphQL edges → Product[]", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/Product/1",
                      title: "Cerveza",
                      description: "fria",
                      availableForSale: true,
                      variants: {
                        edges: [
                          {
                            node: {
                              price: {
                                amount: "2500.00",
                                currencyCode: "COP",
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token123",
    });
    const res = await cat.search({ query: "cerveza" });

    expect(res[0]).toMatchObject({
      id: "gid://shopify/Product/1",
      name: "Cerveza",
      priceCop: 2500,
      available: true,
      description: "fria",
    });
    fetchMock.mockRestore();
  });

  it("POST hits .../api/2025-01/graphql.json con header Storefront Access Token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [],
              },
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "mystore",
      storefrontToken: "abc123def",
    });
    await cat.search({ query: "test" });

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const [url, options] = calls[0];

    expect(String(url)).toContain("mystore.myshopify.com");
    expect(String(url)).toContain("/api/2025-01/graphql.json");
    expect((options as RequestInit)?.headers).toMatchObject({
      "X-Shopify-Storefront-Access-Token": "abc123def",
      "Content-Type": "application/json",
    });

    fetchMock.mockRestore();
  });

  it("si shop ya contiene .myshopify.com, no lo duplica", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [],
              },
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "mystore.myshopify.com",
      storefrontToken: "token",
    });
    await cat.search({ query: "test" });

    const calls = vi.mocked(fetch).mock.calls;
    const [url] = calls[0];
    const urlStr = String(url);

    expect(urlStr).toContain("mystore.myshopify.com");
    expect(urlStr.split(".myshopify.com").length).toBe(2); // Exactly 1 occurrence

    fetchMock.mockRestore();
  });

  it("error (status 500) → []", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("error", { status: 500 }));

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });
    const res = await cat.search({ query: "test" });

    expect(res).toEqual([]);
    fetchMock.mockRestore();
  });

  it("GraphQL errors → []", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [{ message: "Invalid query" }],
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });
    const res = await cat.search({ query: "test" });

    expect(res).toEqual([]);
    fetchMock.mockRestore();
  });

  it("priceCop se calcula desde amount string", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/Product/1",
                      title: "Producto",
                      availableForSale: true,
                      variants: {
                        edges: [
                          {
                            node: {
                              price: {
                                amount: "3499.99",
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });
    const res = await cat.search({ query: "test" });

    expect(res[0]?.priceCop).toBe(3500);
    fetchMock.mockRestore();
  });

  it("sin variantes → priceCop 0", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/Product/1",
                      title: "Producto",
                      availableForSale: true,
                      variants: {
                        edges: [],
                      },
                    },
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });
    const res = await cat.search({ query: "test" });

    expect(res[0]?.priceCop).toBe(0);
    fetchMock.mockRestore();
  });

  it("respeta limit en search", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/Product/1",
                      title: "P1",
                      availableForSale: true,
                      variants: {
                        edges: [
                          {
                            node: {
                              price: {
                                amount: "1000.00",
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                  {
                    node: {
                      id: "gid://shopify/Product/2",
                      title: "P2",
                      availableForSale: true,
                      variants: {
                        edges: [
                          {
                            node: {
                              price: {
                                amount: "2000.00",
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });

    const calls = vi.mocked(fetch).mock.calls;
    // Clear previous calls
    calls.length = 0;

    await cat.search({ query: "test", limit: 5 });

    const [, options] = calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.variables.first).toBe(5);

    fetchMock.mockRestore();
  });

  it("get(id) retorna Product | null", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              product: {
                id: "gid://shopify/Product/1",
                title: "Cerveza",
                description: "fria",
                availableForSale: true,
                variants: {
                  edges: [
                    {
                      node: {
                        price: {
                          amount: "2500.00",
                        },
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });
    const res = await cat.get("gid://shopify/Product/1");

    expect(res).toMatchObject({
      id: "gid://shopify/Product/1",
      name: "Cerveza",
      priceCop: 2500,
      available: true,
      description: "fria",
    });
    fetchMock.mockRestore();
  });

  it("get(id) con producto no encontrado → null", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              product: null,
            },
          }),
          { status: 200 }
        )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });
    const res = await cat.get("invalid-id");

    expect(res).toBeNull();
    fetchMock.mockRestore();
  });

  it("timeout (8s) vía AbortController", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 100)
          )
      );

    const cat = makeShopifyCatalog({
      shop: "test",
      storefrontToken: "token",
    });
    const res = await cat.search({ query: "test" });

    expect(res).toEqual([]);
    fetchMock.mockRestore();
  });
});
