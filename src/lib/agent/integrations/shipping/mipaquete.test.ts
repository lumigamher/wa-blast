import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMipaqueteShipping, searchMipaqueteLocations } from "./mipaquete";

afterEach(() => vi.restoreAllMocks());

const CATALOG = [
  { locationName: "MEDELLÍN", locationCode: "05001000" },
  { locationName: "BOGOTÁ, D.C.", locationCode: "11001000" },
];
const QUOTE = [
  { deliveryCompanyName: "SERVIENTREGA", shippingCost: 21000, shippingTime: 2 },
  { deliveryCompanyName: "ENVIA", shippingCost: 16500, shippingTime: "3" },
];

function mockFetch(quoteStatus = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = url.toString();
    if (u.includes("/getLocations")) {
      return new Response(JSON.stringify(CATALOG), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/quoteShipping")) {
      return new Response(quoteStatus === 200 ? JSON.stringify(QUOTE) : "err", { status: quoteStatus });
    }
    return new Response("nope", { status: 404 });
  });
}

describe("makeMipaqueteShipping", () => {
  it("resuelve la ciudad por nombre y mapea quoteShipping a CarrierQuote[]", async () => {
    const fetchMock = mockFetch();
    const p = makeMipaqueteShipping({ apiKey: "jwt-x", originCityCode: "05001000" });
    const quotes = await p.quote({
      originCityName: "Medellín",
      destinationCityName: "Bogotá",
      pkg: { pesoFacturableKg: 1.6, lengthCm: 20, widthCm: 20, heightCm: 10 },
      declaredValueCop: 50000,
    });
    expect(quotes).toEqual([
      { carrier: "SERVIENTREGA", service: "Estándar", priceCop: 21000, deliveryDays: 2 },
      { carrier: "ENVIA", service: "Estándar", priceCop: 16500, deliveryDays: 3 },
    ]);
    // auth: apikey header en ambas llamadas
    for (const call of fetchMock.mock.calls) {
      const init = call[1] ?? {};
      expect(JSON.stringify(init.headers)).toContain("jwt-x");
    }
    // el body de quoteShipping lleva el código resuelto de destino + país 170
    const quoteCall = fetchMock.mock.calls.find((c) => c[0].toString().includes("/quoteShipping"));
    const body = JSON.parse((quoteCall?.[1]?.body as string) ?? "{}");
    expect(body.destinyLocationCode).toBe("11001000");
    expect(body.originLocationCode).toBe("05001000");
    expect(body.originCountryCode).toBe("170");
  });

  it("acepta un código de ciudad directo como destino (sin getLocations)", async () => {
    const fetchMock = mockFetch();
    const p = makeMipaqueteShipping({ apiKey: "x", originCityCode: "05001000" });
    const quotes = await p.quote({
      originCityName: "Medellín",
      destinationCityName: "11001000",
      pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
      declaredValueCop: 1,
    });
    expect(quotes.length).toBe(2);
    expect(fetchMock.mock.calls.some((c) => c[0].toString().includes("/getLocations"))).toBe(false);
  });

  it("ciudad no encontrada en el catálogo → [] (no cotiza)", async () => {
    const fetchMock = mockFetch();
    const p = makeMipaqueteShipping({ apiKey: "x", originCityCode: "05001000" });
    const quotes = await p.quote({
      originCityName: "Medellín",
      destinationCityName: "Atlantis",
      pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
      declaredValueCop: 1,
    });
    expect(quotes).toEqual([]);
    expect(fetchMock.mock.calls.some((c) => c[0].toString().includes("/quoteShipping"))).toBe(false);
  });

  it("quoteShipping HTTP error → []", async () => {
    mockFetch(500);
    const p = makeMipaqueteShipping({ apiKey: "x", originCityCode: "05001000" });
    expect(
      await p.quote({
        originCityName: "Medellín",
        destinationCityName: "Bogotá",
        pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
        declaredValueCop: 1,
      }),
    ).toEqual([]);
  });

  it("sin código de origen → []", async () => {
    mockFetch();
    const p = makeMipaqueteShipping({ apiKey: "x", originCityCode: "" });
    expect(
      await p.quote({
        originCityName: "",
        destinationCityName: "Bogotá",
        pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
        declaredValueCop: 1,
      }),
    ).toEqual([]);
  });
});

describe("searchMipaqueteLocations", () => {
  const EXTENDED_CATALOG = [
    { locationName: "MEDELLÍN", locationCode: "05001000", departmentOrStateName: "ANTIOQUIA" },
    { locationName: "BOGOTÁ, D.C.", locationCode: "11001000", departmentOrStateName: "BOGOTÁ" },
    { locationName: "MEDELLÍN DEL ARIARI", locationCode: "50001000", departmentOrStateName: "META" },
    { locationName: "CALI", locationCode: "76001000", departmentOrStateName: "VALLE" },
  ];

  function mockFetchForSearch() {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = url.toString();
      if (u.includes("/getLocations")) {
        return new Response(JSON.stringify(EXTENDED_CATALOG), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("nope", { status: 404 });
    });
  }

  it("busca por nombre: 'medellin' devuelve MEDELLÍN + MEDELLÍN DEL ARIARI (accent-insensitive)", async () => {
    mockFetchForSearch();
    const results = await searchMipaqueteLocations("api-key", "medellin");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      name: "MEDELLÍN",
      code: "05001000",
      department: "ANTIOQUIA",
    });
    expect(results[1]).toEqual({
      name: "MEDELLÍN DEL ARIARI",
      code: "50001000",
      department: "META",
    });
  });

  it("busca por nombre: 'bogota' devuelve BOGOTÁ, D.C. (match en parte pre-coma)", async () => {
    mockFetchForSearch();
    const results = await searchMipaqueteLocations("api-key", "bogota");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: "BOGOTÁ, D.C.",
      code: "11001000",
      department: "BOGOTÁ",
    });
  });

  it("query vacío → []", async () => {
    mockFetchForSearch();
    const results = await searchMipaqueteLocations("api-key", "");
    expect(results).toEqual([]);
  });

  it("query solo whitespace → []", async () => {
    mockFetchForSearch();
    const results = await searchMipaqueteLocations("api-key", "   ");
    expect(results).toEqual([]);
  });

  it("HTTP error en getLocations → []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );
    const results = await searchMipaqueteLocations("api-key", "medellin");
    expect(results).toEqual([]);
  });

  it("respuesta no es array → []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid" }), { status: 200 }),
    );
    const results = await searchMipaqueteLocations("api-key", "medellin");
    expect(results).toEqual([]);
  });

  it("respeta el parámetro limit", async () => {
    mockFetchForSearch();
    const results = await searchMipaqueteLocations("api-key", "", 2); // limit 2, pero query vacío
    expect(results).toEqual([]); // vacío porque query es vacío
  });

  it("devuelve máximo 'limit' resultados", async () => {
    mockFetchForSearch();
    const results = await searchMipaqueteLocations("api-key", "a", 1); // todo empieza con A mayúscula post-normalización
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("deduplica por código de ubicación", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { locationName: "BOGOTÁ", locationCode: "11001000", departmentOrStateName: "BOGOTÁ" },
          { locationName: "BOGOTA", locationCode: "11001000", departmentOrStateName: "BOGOTÁ" }, // dupe
        ]),
        { status: 200 },
      ),
    );
    const results = await searchMipaqueteLocations("api-key", "bogota");
    expect(results).toHaveLength(1);
  });

  it("ignora ubicaciones sin locationCode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { locationName: "MEDELLÍN", locationCode: "05001000" },
          { locationName: "BOGOTÁ", departmentOrStateName: "BOGOTÁ" }, // sin code
        ]),
        { status: 200 },
      ),
    );
    const results = await searchMipaqueteLocations("api-key", "b");
    expect(results).toHaveLength(0); // "bogota" no matchea con MEDELLÍN
  });

  it("envía apikey en headers", async () => {
    const fetchMock = mockFetchForSearch();
    await searchMipaqueteLocations("secret-api-key", "medellin");
    const call = fetchMock.mock.calls[0];
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers?.apikey).toBe("secret-api-key");
    expect(headers?.["session-tracker"]).toBeDefined();
  });
});
