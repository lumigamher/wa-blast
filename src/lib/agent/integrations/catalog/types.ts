export type Product = {
  id: string;
  name: string;
  priceCop: number;
  description?: string | null;
  available: boolean;
};

export interface CatalogProvider {
  search(input: { query: string; limit?: number }): Promise<Product[]>;
  get(id: string): Promise<Product | null>;
}
