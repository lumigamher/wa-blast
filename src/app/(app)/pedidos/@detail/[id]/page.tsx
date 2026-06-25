import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { db } from "@/lib/db/client";
import { getOrder } from "@/lib/agent/catalog/orders";
import { OrderDetail } from "./_detail";

export const dynamic = "force-dynamic";

// Parseo tolerante: un JSON malformado (escrito por el agente/integraciones) NO debe
// tumbar la página con un 500.
function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("agente");
  const { orgId } = await requireOrg();
  const { id } = await params;
  const order = await getOrder(db, orgId, id);
  if (!order) notFound();

  const items = safeParse<Array<{ nombre: string; cantidad: number; subtotal: number; precioUnitario: number; variantLabel?: string }>>(order.itemsJson, []);
  const address = safeParse<{ destinatario?: string; telefono?: string; departamento?: string; ciudad?: string; direccion?: string; barrio?: string; indicaciones?: string } | null>(order.shippingAddressJson, null);
  const quote = safeParse<{ carrier?: string; priceCop?: number | null; deliveryDays?: number | null } | null>(order.shippingQuoteJson, null);

  return (
    <OrderDetail
      id={order.id}
      numero={order.numero}
      status={order.status}
      dispatched={!!order.dispatchedAt}
      totalCop={order.totalCop}
      paymentMethod={order.paymentMethod}
      comprobanteMediaId={order.comprobanteMediaId}
      contactName={order.contactName}
      phone={order.phone}
      city={order.city}
      conversationId={order.conversationId}
      items={items}
      address={address}
      quote={quote}
      createdAt={order.createdAt.getTime()}
    />
  );
}
