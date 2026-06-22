import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMipaqueteShipping } from "./mipaquete";

afterEach(() => vi.restoreAllMocks());

describe("makeMipaqueteShipping", () => {
  it("mapea respuesta a CarrierQuote[] y envía auth header", async () => {
    const mockResponse = {
      delivery_options: [
        {
          company: "Servientrega",
          value: 18500,
          timeDelivery: 2,
        },
        {
          company: "Interrapidísimo",
          value: 22000,
          timeDelivery: 1,
        },
      ],
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const provider = makeMipaqueteShipping({
      apiKey: "jwt-token-123",
      originCityCode: "05001000",
    });

    const quotes = await provider.quote({
      originCityName: "Medellín",
      originCityCode: "05001000",
      destinationCityName: "Bogotá",
      pkg: {
        pesoFacturableKg: 1.6,
        lengthCm: 20,
        widthCm: 20,
        heightCm: 10,
      },
      declaredValueCop: 50000,
    });

    expect(Array.isArray(quotes)).toBe(true);
    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toEqual({
      carrier: "Servientrega",
      service: "Standard",
      priceCop: 18500,
      deliveryDays: 2,
    });
    expect(quotes[1]).toEqual({
      carrier: "Interrapidísimo",
      service: "Standard",
      priceCop: 22000,
      deliveryDays: 1,
    });

    // Verify auth token was sent
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("mipaquete.com");
    expect(init?.headers).toBeDefined();
    const headers = init?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toContain("jwt-token-123");
  });

  it("HTTP error → []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }),
    );

    const quotes = await makeMipaqueteShipping({
      apiKey: "x",
      originCityCode: "1",
    }).quote({
      originCityName: "A",
      destinationCityName: "B",
      pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
      declaredValueCop: 1,
    });

    expect(quotes).toEqual([]);
  });

  it("network error → []", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const quotes = await makeMipaqueteShipping({
      apiKey: "x",
      originCityCode: "1",
    }).quote({
      originCityName: "A",
      destinationCityName: "B",
      pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
      declaredValueCop: 1,
    });

    expect(quotes).toEqual([]);
  });

  it("empty delivery_options → []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ delivery_options: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const quotes = await makeMipaqueteShipping({
      apiKey: "x",
      originCityCode: "1",
    }).quote({
      originCityName: "A",
      destinationCityName: "B",
      pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
      declaredValueCop: 1,
    });

    expect(quotes).toEqual([]);
  });

  it("tolerates field name variations in response", async () => {
    const mockResponse = {
      delivery_options: [
        {
          company: "Servientrega",
          value: 18500,
          timeDelivery: 2,
        },
        {
          company: "Interrapidísimo",
          precio: 22000, // alternative field name
          tiempoEntrega: 1, // alternative field name
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const quotes = await makeMipaqueteShipping({
      apiKey: "x",
      originCityCode: "1",
    }).quote({
      originCityName: "A",
      destinationCityName: "B",
      pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 },
      declaredValueCop: 1,
    });

    expect(quotes).toHaveLength(2);
    expect(quotes[0].priceCop).toBe(18500);
    expect(quotes[0].deliveryDays).toBe(2);
    expect(quotes[1].priceCop).toBe(22000);
    expect(quotes[1].deliveryDays).toBe(1);
  });
});
