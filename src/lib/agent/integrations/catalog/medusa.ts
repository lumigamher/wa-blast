import type {
  CatalogProvider,
  Product,
  ProductImage,
  ProductVariant,
} from "./types";

interface MedusaCatalogConfig {
  backendUrl: string;
  publishableKey: string;
  regionId?: string;
}

type MedusaVariant = {
  id?: unknown;
  title?: unknown;
  sku?: unknown;
  calculated_price?: { calculated_amount?: unknown } | null;
  inventory_quantity?: unknown;
  allow_backorder?: unknown;
  manage_inventory?: unknown;
};
type MedusaProduct = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  thumbnail?: unknown;
  variants?: MedusaVariant[];
  images?: { url?: unknown }[];
};

const FIELDS = "*variants.calculated_price,*images";

export function makeMedusaCatalog(cfg: MedusaCatalogConfig): CatalogProvider {
  const base = cfg.backendUrl.replace(/\/+$/, "");
  const headers = { "x-publishable-api-key": cfg.publishableKey };
  let cachedRegionId: string | null = cfg.regionId?.trim() ? cfg.regionId.trim() : null;

  async function fetchJson(path: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${base}${path}`, { headers, signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function resolveRegionId(): Promise<string | null> {
    if (cachedRegionId) return cachedRegionId;
    const data = await fetchJson("/store/regions");
    const id = data?.regions?.[0]?.id;
    if (typeof id === "string" && id) {
      cachedRegionId = id;
      return id;
    }
    return null;
  }

  function mapVariant(raw: MedusaVariant): ProductVariant | null {
    const id = raw?.id ? String(raw.id) : "";
    const priceNum = Number(raw?.calculated_price?.calculated_amount);
    if (!id || !Number.isFinite(priceNum) || priceNum < 0) return null;
    const available =
      raw?.manage_inventory === false ||
      raw?.allow_backorder === true ||
      Number(raw?.inventory_quantity ?? 0) > 0;
    return {
      id,
      label: raw?.title ? String(raw.title) : "",
      priceCop: Math.round(priceNum),
      sku: raw?.sku ? String(raw.sku) : null,
      available,
    };
  }

  function mapProduct(raw: MedusaProduct): Product | null {
    const id = raw?.id ? String(raw.id) : "";
    const name = raw?.title ? String(raw.title) : "";
    if (!id || !name) return null;
    const variants = (raw?.variants ?? [])
      .map(mapVariant)
      .filter((v): v is ProductVariant => v !== null);
    if (variants.length === 0) return null;
    const priceCop = Math.min(...variants.map((v) => v.priceCop));
    const images: ProductImage[] = [];
    if (raw?.thumbnail) images.push({ url: String(raw.thumbnail) });
    for (const img of raw?.images ?? []) {
      if (img?.url) {
        const url = String(img.url);
        if (!images.some((i) => i.url === url)) images.push({ url });
      }
    }
    return {
      id,
      name,
      priceCop,
      description: raw?.description ? String(raw.description) : null,
      available: variants.some((v) => v.available),
      variants,
      images,
    };
  }

  return {
    async search({ query, limit = 10 }): Promise<Product[]> {
      const regionId = await resolveRegionId();
      if (!regionId) return [];
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        region_id: regionId,
        fields: FIELDS,
      });
      const data = await fetchJson(`/store/products?${params}`);
      const items: MedusaProduct[] = Array.isArray(data?.products) ? data.products : [];
      return items
        .map(mapProduct)
        .filter((p): p is Product => p !== null)
        .slice(0, limit);
    },

    async get(id: string): Promise<Product | null> {
      const regionId = await resolveRegionId();
      if (!regionId) return null;
      const params = new URLSearchParams({ region_id: regionId, fields: FIELDS });
      const data = await fetchJson(`/store/products/${encodeURIComponent(id)}?${params}`);
      const raw = data?.product;
      if (!raw || typeof raw !== "object") return null;
      return mapProduct(raw as MedusaProduct);
    },
  };
}
