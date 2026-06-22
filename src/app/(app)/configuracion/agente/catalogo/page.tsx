import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getCatalogConfig } from "@/lib/agent/integrations/catalog/config";
import { listProducts, countProducts } from "@/lib/agent/admin";
import { listVariants } from "@/lib/agent/catalog/variants";
import { listImages, imageUrl } from "@/lib/agent/catalog/images";
import { AgentCatalog } from "../_catalog";
import { AgentProducts } from "../_products";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { orgId } = await requireOrg();
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const catalogConfig = await getCatalogConfig(db, orgId);
  const isInternal = catalogConfig?.provider === "internal" || !catalogConfig;

  const total = isInternal ? await countProducts(db, orgId, { search }) : 0;
  const baseProductList = isInternal
    ? await listProducts(db, orgId, { search, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
    : [];

  const productList = await Promise.all(
    baseProductList.map(async (product) => {
      const variants = await listVariants(db, orgId, product.id);
      const imageRows = await listImages(db, orgId, product.id);
      return {
        ...product,
        variants: variants.map((v) => ({
          id: v.id, label: v.label, priceCop: v.priceCop, sku: v.sku, available: v.available,
        })),
        images: imageRows.map((r) => ({
          id: r.id, url: imageUrl(r), label: r.label, variantId: r.variantId,
        })),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <AgentCatalog provider={catalogConfig?.provider ?? "internal"} config={catalogConfig?.config ?? {}} />
      {isInternal && (
        <AgentProducts
          items={productList}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          search={search}
        />
      )}
    </div>
  );
}
