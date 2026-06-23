import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMedusaCatalog } from "./medusa";

afterEach(() => vi.restoreAllMocks());

const PRODUCTS = {
  products: [
    {
      id: "prod_1",
      title: "Teclado mecánico KOKO",
      description: "RGB",
      thumbnail: "https://cdn/x/thumb.jpg",
      images: [{ url: "https://cdn/x/thumb.jpg" }, { url: "https://cdn/x/2.jpg" }],
      variants: [
        {
          id: "var_a",
          title: "Switch rojo",
          sku: "KOKO-R",
          calculated_price: { calculated_amount: 189900 },
          inventory_quantity: 5,
          manage_inventory: true,
        },
        {
          id: "var_b",
          title: "Switch azul",
          sku: "KOKO-B",
          calculated_price: { calculated_amount: 179900 },
          inventory_quantity: 0,
          allow_backorder: false,
          manage_inventory: true,
        },
      ],
    },
  ],
};

function mockFetch(handler: (url: string) => unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    return Promise.resolve(new Response(JSON.stringify(handler(url)), { status: 200 }));
  });
}

describe("medusa catalog", () => {
  it("search mapea producto con variantes, imágenes y precio menor", async () => {
    mockFetch((url) =>
      url.includes("/store/regions") ? { regions: [{ id: "reg_1" }] } : PRODUCTS,
    );
    const cat = makeMedusaCatalog({
      backendUrl: "https://api.elman.com",
      publishableKey: "pk_test",
    });
    const res = await cat.search({ query: "teclado" });

    expect(res).toHaveLength(1);
    const p = res[0];
    expect(p.id).toBe("prod_1");
    expect(p.name).toBe("Teclado mecánico KOKO");
    expect(p.priceCop).toBe(179900); // menor variante válida
    expect(p.available).toBe(true); // var_a tiene stock
    expect(p.variants).toHaveLength(2);
    expect(p.variants?.[1]).toMatchObject({ id: "var_b", available: false });
    expect(p.images).toHaveLength(2); // thumb dedupe
  });

  it("manda x-publishable-api-key y region_id en /store/products", async () => {
    const fetchMock = mockFetch((url) =>
      url.includes("/store/regions") ? { regions: [{ id: "reg_1" }] } : PRODUCTS,
    );
    const cat = makeMedusaCatalog({
      backendUrl: "https://api.elman.com",
      publishableKey: "pk_test",
    });
    await cat.search({ query: "teclado" });

    const productsCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/store/products"),
    );
    expect(String(productsCall?.[0])).toContain("region_id=reg_1");
    const headers = (productsCall?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers["x-publishable-api-key"]).toBe("pk_test");
  });

  it("usa regionId de config sin llamar a /store/regions", async () => {
    const fetchMock = mockFetch(() => PRODUCTS);
    const cat = makeMedusaCatalog({
      backendUrl: "https://api.elman.com",
      publishableKey: "pk_test",
      regionId: "reg_cfg",
    });
    await cat.search({ query: "x" });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/store/regions"))).toBe(false);
    const productsCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/store/products"));
    expect(String(productsCall?.[0])).toContain("region_id=reg_cfg");
  });

  it("descarta producto sin variantes con precio válido", async () => {
    mockFetch((url) =>
      url.includes("/store/regions")
        ? { regions: [{ id: "reg_1" }] }
        : { products: [{ id: "p", title: "Sin precio", variants: [{ id: "v" }] }] },
    );
    const cat = makeMedusaCatalog({ backendUrl: "https://api.elman.com", publishableKey: "pk" });
    expect(await cat.search({ query: "x" })).toEqual([]);
  });

  it("error de red → [] en search y null en get", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    const cat = makeMedusaCatalog({ backendUrl: "https://api.elman.com", publishableKey: "pk", regionId: "r" });
    expect(await cat.search({ query: "x" })).toEqual([]);
    expect(await cat.get("p")).toBeNull();
  });

  it("get mapea un producto por id", async () => {
    mockFetch(() => ({ product: PRODUCTS.products[0] }));
    const cat = makeMedusaCatalog({ backendUrl: "https://api.elman.com", publishableKey: "pk", regionId: "r" });
    const p = await cat.get("prod_1");
    expect(p?.id).toBe("prod_1");
    expect(p?.priceCop).toBe(179900);
  });
});
