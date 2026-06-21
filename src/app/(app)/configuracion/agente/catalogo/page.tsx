import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getCatalogConfig } from "@/lib/agent/integrations/catalog/config";
import { listProducts } from "@/lib/agent/admin";
import { listVariants } from "@/lib/agent/catalog/variants";
import { listImages, imageUrl } from "@/lib/agent/catalog/images";
import { AgentCatalog } from "../_catalog";
import { AgentProducts } from "../_products";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const { orgId } = await requireOrg();

  const catalogConfig = await getCatalogConfig(db, orgId);
  const baseProductList =
    catalogConfig?.provider === "internal" || !catalogConfig ? await listProducts(db, orgId) : [];

  // Load variants and images for each product
  const productList = await Promise.all(
    baseProductList.map(async (product) => {
      const variants = await listVariants(db, product.id);
      const imageRows = await listImages(db, product.id);
      return {
        ...product,
        variants: variants.map((v) => ({
          id: v.id,
          label: v.label,
          priceCop: v.priceCop,
          sku: v.sku,
          available: v.available,
        })),
        images: imageRows.map((r) => ({
          id: r.id,
          url: imageUrl(r),
          label: r.label,
          variantId: r.variantId,
        })),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <AgentCatalog
        provider={catalogConfig?.provider ?? "internal"}
        config={catalogConfig?.config ?? {}}
      />

      {(catalogConfig?.provider === "internal" || !catalogConfig) && (
        <AgentProducts items={productList} />
      )}
    </div>
  );
}
