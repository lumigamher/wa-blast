import type { CarrierQuote, ManualShippingConfig, ShippingProvider, ShippingQuoteInput } from "./types";

export function makeManualShipping(config: ManualShippingConfig): ShippingProvider {
  return {
    async quote(input: ShippingQuoteInput): Promise<CarrierQuote[]> {
      const dest = input.destinationCityName.trim().toLowerCase();
      const cityRates = config.rates
        .filter((r) => r.city && r.city.trim().toLowerCase() === dest)
        .sort((a, b) => a.maxWeightKg - b.maxWeightKg);
      const defaultRates = config.rates
        .filter((r) => !r.city)
        .sort((a, b) => a.maxWeightKg - b.maxWeightKg);
      const pool = cityRates.length > 0 ? cityRates : defaultRates;
      const match = pool.find((r) => input.pkg.pesoFacturableKg <= r.maxWeightKg);
      if (!match) return [];
      return [
        {
          carrier: "Tabla manual",
          service: `Hasta ${match.maxWeightKg} kg`,
          priceCop: match.priceCop,
          deliveryDays: match.deliveryDays ?? null,
        },
      ];
    },
  };
}
