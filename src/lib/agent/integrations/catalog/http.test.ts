import { describe, expect, it, vi } from "vitest";
import { makeHttpCatalog } from "./http";

describe("http catalog", () => {
  it("search mapea array de productos", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([{ id: "x1", name: "Cerveza", price: 2500 }]), {
          status: 200,
        })
      );
    const cat = makeHttpCatalog({ url: "https://api.x/products", apiKey: "k" });
    const res = await cat.search({ query: "cerveza" });
    expect(res[0]).toMatchObject({
      id: "x1",
      name: "Cerveza",
      priceCop: 2500,
      available: true,
    });
    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("soporta {data:[...]} y campos personalizados", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ sku: "A", titulo: "Agua", valor: 1500 }],
          }),
          { status: 200 }
        )
      );
    const cat = makeHttpCatalog({
      url: "https://api.x/p",
      idField: "sku",
      nameField: "titulo",
      priceField: "valor",
    });
    const res = await cat.search({ query: "agua" });
    expect(res[0]).toMatchObject({ id: "A", name: "Agua", priceCop: 1500 });
    fetchMock.mockRestore();
  });

  it("error de red → []", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));
    const cat = makeHttpCatalog({ url: "https://api.x/p" });
    expect(await cat.search({ query: "x" })).toEqual([]);
    fetchMock.mockRestore();
  });
});
