export type ProductVariant = {
  id: string;
  label: string;
  priceCop: number;
  sku?: string | null;
  available: boolean;
};

export type ProductImage = {
  url: string;
  label?: string | null;
  variantId?: string | null;
};

export type Product = {
  id: string;
  name: string;
  priceCop: number;
  description?: string | null;
  available: boolean;
  variants?: ProductVariant[];
  images?: ProductImage[];
};

export interface CatalogProvider {
  search(input: { query: string; limit?: number }): Promise<Product[]>;
  get(id: string): Promise<Product | null>;
}
