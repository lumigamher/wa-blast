import { randomUUID } from "node:crypto";
import type { CarrierQuote, ShippingProvider, ShippingQuoteInput } from "./types";

/**
 * Mipaquete API v2 — agregador de transportadoras colombianas
 * (Servientrega, Envía, TCC, Coordinadora, Interrapidísimo…).
 *
 * VERIFICADO EN VIVO 2026-06-22 contra la cuenta real (Postman collection
 * 14212363/Tzm8GFfQ + llamadas reales con la API key del cliente):
 * - Base: https://api.mipaquete.com (SIN prefijo /api).
 * - Headers: `apikey: <JWT>` + `session-tracker: <uuid por request>`.
 * - Cotización: POST /quoteShipping con body:
 *     { originCountryCode:"170", originLocationCode, destinyCountryCode:"170",
 *       destinyLocationCode, quantity, width, length, height, weight, declaredValue }
 *   (170 = código de país de Colombia; medidas en cm; peso en kg).
 *   Respuesta: [{ deliveryCompanyName, shippingCost, shippingTime, ... }].
 * - Ciudades→código: GET /getLocations (sin params devuelve el catálogo completo,
 *   ~1392 ubicaciones, cada una con { locationName, locationCode }).
 *   Ej. real: MEDELLÍN=05001000, BOGOTÁ=11001000.
 */

const BASE_URL = "https://api.mipaquete.com";
const COLOMBIA_COUNTRY_CODE = "170";

type MipaqueteLocation = { locationName: string; locationCode: string };
type MipaqueteQuoteOption = {
  deliveryCompanyName?: string;
  shippingCost?: number;
  shippingTime?: number | string;
};

function authHeaders(apiKey: string): Record<string, string> {
  return { apikey: apiKey, "session-tracker": randomUUID() };
}

function normalizeCity(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCode(s: string): boolean {
  return /^\d{6,}$/.test(s.trim());
}

export function makeMipaqueteShipping(opts: {
  apiKey: string;
  originCityCode: string;
}): ShippingProvider {
  // Caché del catálogo de ciudades por instancia (máx. 1 fetch por turno).
  let cityMap: Map<string, string> | null = null;

  async function loadCityMap(): Promise<Map<string, string>> {
    if (cityMap) return cityMap;
    const res = await fetch(`${BASE_URL}/getLocations`, { headers: authHeaders(opts.apiKey) });
    const map = new Map<string, string>();
    if (res.ok) {
      const locs = (await res.json()) as MipaqueteLocation[];
      for (const l of locs) {
        if (!l?.locationCode) continue;
        const full = normalizeCity(l.locationName ?? "");
        const head = full.split(",")[0].trim(); // "BOGOTA, D.C." -> "BOGOTA"
        if (full && !map.has(full)) map.set(full, l.locationCode);
        if (head && !map.has(head)) map.set(head, l.locationCode);
      }
    }
    cityMap = map;
    return map;
  }

  async function resolveCity(name: string): Promise<string | null> {
    if (looksLikeCode(name)) return name.trim();
    const map = await loadCityMap();
    return map.get(normalizeCity(name)) ?? null;
  }

  return {
    async quote(input: ShippingQuoteInput): Promise<CarrierQuote[]> {
      try {
        const originCode = input.originCityCode?.trim() || opts.originCityCode.trim();
        if (!originCode) return [];
        const destinyCode = await resolveCity(input.destinationCityName);
        if (!destinyCode) return []; // ciudad no resuelta → caller cae al fallback / pide código

        const res = await fetch(`${BASE_URL}/quoteShipping`, {
          method: "POST",
          headers: { ...authHeaders(opts.apiKey), "content-type": "application/json" },
          body: JSON.stringify({
            originCountryCode: COLOMBIA_COUNTRY_CODE,
            originLocationCode: originCode,
            destinyCountryCode: COLOMBIA_COUNTRY_CODE,
            destinyLocationCode: destinyCode,
            quantity: 1,
            width: input.pkg.widthCm,
            length: input.pkg.lengthCm,
            height: input.pkg.heightCm,
            weight: input.pkg.pesoFacturableKg,
            declaredValue: input.declaredValueCop,
          }),
        });
        if (!res.ok) return [];

        const data = (await res.json()) as MipaqueteQuoteOption[];
        if (!Array.isArray(data)) return [];

        return data.map((o): CarrierQuote => {
          const days = o.shippingTime != null ? Number(o.shippingTime) : Number.NaN;
          return {
            carrier: o.deliveryCompanyName ?? "Transportadora",
            service: "Estándar",
            priceCop: Math.round(Number(o.shippingCost ?? 0)),
            deliveryDays: Number.isFinite(days) ? days : null,
          };
        });
      } catch {
        // NUNCA lanza: el turno del agente no debe romperse.
        return [];
      }
    },
  };
}
