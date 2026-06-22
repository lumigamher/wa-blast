import type { ShippingProvider } from "./types";

export function makeMipaqueteShipping(_opts: {
  apiKey: string;
  originCityCode: string;
}): ShippingProvider {
  return {
    async quote() {
      return [];
    },
  };
}
