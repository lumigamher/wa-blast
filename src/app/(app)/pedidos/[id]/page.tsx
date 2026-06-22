import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { db } from "@/lib/db/client";
import { getOrder } from "@/lib/agent/catalog/orders";
import { OrderDetail } from "./_detail";

export const dynamic = "force-dynamic";

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("agente");
  const { orgId } = await requireOrg();
  const { id } = await params;
  const order = await getOrder(db, orgId, id);
  if (!order) notFound();

  const items = JSON.parse(order.itemsJson) as Array<{ nombre: string; cantidad: number; subtotal: number; precioUnitario: number }>;
  const address = order.shippingAddressJson ? JSON.parse(order.shippingAddressJson) : null;
  const quote = order.shippingQuoteJson ? JSON.parse(order.shippingQuoteJson) : null;

  return (
    <OrderDetail
      id={order.id}
      status={order.status}
      dispatched={!!order.dispatchedAt}
      totalCop={order.totalCop}
      paymentMethod={order.paymentMethod}
      comprobanteMediaId={order.comprobanteMediaId}
      customer={order.contactName || order.phone || "Sin cliente"}
      items={items}
      address={address}
      quote={quote}
      createdAt={order.createdAt.getTime()}
    />
  );
}
