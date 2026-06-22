import { requireOrg } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { db } from "@/lib/db/client";
import { listOrders, countOrders, type OrderStatus } from "@/lib/agent/catalog/orders";
import { OrdersList } from "./_orders";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES: OrderStatus[] = ["pendiente", "confirmado", "pagado", "cancelado"];

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireModuleAccess("agente");
  const { orgId } = await requireOrg();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const total = await countOrders(db, orgId, { status });
  const items = await listOrders(db, orgId, { status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <OrdersList
      items={items.map((o) => ({ ...o, createdAt: o.createdAt.getTime(), dispatchedAt: o.dispatchedAt ? o.dispatchedAt.getTime() : null }))}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      status={status ?? ""}
    />
  );
}
