import type { CarrierQuote, ShippingProvider, ShippingQuoteInput } from "./types";

/**
 * Mipaquete API Integration
 *
 * Colombian shipping aggregator (Servientrega, Interrapidísimo, Envía, etc).
 * Uses REST API with JWT Bearer token authentication.
 *
 * API Reference:
 * - Documentation: https://api.documentacion.mipaquete.com/ (verified 2026-06-22)
 * - Endpoint (packaging): POST https://api.mipaquete.com/api/calculate-delivery-options
 * - Endpoint (messaging): POST https://api.mipaquete.com/api/messaging-delivery-options
 * - Auth: Authorization header with JWT token (Bearer <token>)
 * - Request body: origin_town, destination_town, weight, width, high, long, declared_value, type_of_load, quantity
 * - Response: { delivery_options: [{ company, value, timeDelivery }, ...] }
 *
 * Source: https://gist.github.com/diegoaguilarf/c07dfc500c67a825c2d09ee0eae4a446
 *         https://github.com/saulmoralespa/mipaquete-api-php
 *
 * Note: The Mipaquete API documentation site requires JavaScript rendering.
 * Field names in response are tolerantly mapped to handle variations.
 * VERIFY IN PROD: Confirm exact field names and endpoint behavior with real data.
 */

const MIPAQUETE_ENDPOINT = "https://api.mipaquete.com/api/calculate-delivery-options";

export function makeMipaqueteShipping(opts: {
  apiKey: string;
  originCityCode: string;
}): ShippingProvider {
  return {
    async quote(input: ShippingQuoteInput): Promise<CarrierQuote[]> {
      try {
        const originCode = input.originCityCode || opts.originCityCode;

        const requestBody = {
          origin_town: input.originCityName,
          origin_code: originCode,
          destination_town: input.destinationCityName,
          weight: input.pkg.pesoFacturableKg,
          width: input.pkg.widthCm,
          high: input.pkg.heightCm, // Note: Mipaquete uses "high" not "height"
          long: input.pkg.lengthCm,
          declared_value: input.declaredValueCop,
          type_of_load: "Estándar",
          quantity: 1,
        };

        const response = await fetch(MIPAQUETE_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          return [];
        }

        const data = (await response.json()) as {
          delivery_options?: Array<{
            company?: string;
            transportadora?: string;
            companyName?: string;
            value?: number;
            precio?: number;
            price?: number;
            timeDelivery?: number;
            tiempoEntrega?: number;
            days?: number;
          }>;
        };

        const options = data.delivery_options ?? [];
        if (!Array.isArray(options) || options.length === 0) {
          return [];
        }

        return options.map((opt): CarrierQuote => {
          // Tolerant field mapping for carrier name
          const carrier = opt.company || opt.transportadora || opt.companyName || "Unknown";

          // Tolerant field mapping for price
          const priceCop = opt.value ?? opt.precio ?? opt.price ?? 0;

          // Tolerant field mapping for delivery days
          const deliveryDays =
            opt.timeDelivery ?? opt.tiempoEntrega ?? opt.days ?? null;

          return {
            carrier,
            service: "Standard",
            priceCop,
            deliveryDays: typeof deliveryDays === "number" ? deliveryDays : null,
          };
        });
      } catch (err) {
        // NEVER throw: agent turn must not break
        return [];
      }
    },
  };
}
