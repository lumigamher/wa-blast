import { makeManualShipping } from "./manual";
import { makeMipaqueteShipping } from "./mipaquete";
import type { ManualShippingConfig, ShippingProvider } from "./types";

export type ShippingResolveInput = {
  provider: "mipaquete" | "manual";
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export function getShippingProvider(input: ShippingResolveInput): ShippingProvider {
  if (input.provider === "mipaquete") {
    return makeMipaqueteShipping({
      apiKey: input.credentials.apiKey ?? "",
      originCityCode: String(input.config.originCityCode ?? ""),
    });
  }
  const rates = (input.config.rates as ManualShippingConfig["rates"]) ?? [];
  return makeManualShipping({ rates });
}
