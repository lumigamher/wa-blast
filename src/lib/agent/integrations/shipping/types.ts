export type ShippingPackage = {
  pesoFacturableKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type ShippingQuoteInput = {
  originCityName: string;
  originCityCode?: string;
  destinationCityName: string;
  pkg: ShippingPackage;
  declaredValueCop: number;
};

export type CarrierQuote = {
  carrier: string;
  service: string;
  priceCop: number;
  deliveryDays: number | null;
};

export interface ShippingProvider {
  quote(input: ShippingQuoteInput): Promise<CarrierQuote[]>;
}

export type ManualRate = {
  city?: string;
  maxWeightKg: number;
  priceCop: number;
  deliveryDays?: number;
};

export type ManualShippingConfig = {
  rates: ManualRate[];
};
