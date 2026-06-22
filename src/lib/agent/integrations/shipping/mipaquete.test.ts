import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMipaqueteShipping } from "./mipaquete";

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
