"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction, setOrderDispatchedAction } from "../../actions";
import type { OrderStatus } from "@/lib/agent/catalog/orders";

const STATUSES: OrderStatus[] = ["pendiente", "confirmado", "pagado", "cancelado"];

type Address = { destinatario?: string; telefono?: string; departamento?: string; ciudad?: string; direccion?: string; barrio?: string; indicaciones?: string };
type Quote = { carrier?: string; priceCop?: number | null; deliveryDays?: number | null };
type Item = { nombre: string; cantidad: number; subtotal: number; precioUnitario: number; variantLabel?: string };

export function OrderDetail({ id, status, dispatched, totalCop, paymentMethod, comprobanteMediaId, customer, items, address, quote, createdAt }: {
  id: string; status: string; dispatched: boolean; totalCop: number; paymentMethod: string | null;
  comprobanteMediaId: string | null; customer: string; items: Item[]; address: Address | null; quote: Quote | null; createdAt: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fmt = (cop: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);

  function changeStatus(s: OrderStatus) {
    start(async () => {
      const r = await updateOrderStatusAction(id, s);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Estado actualizado");
      router.refresh();
    });
  }
  function toggleDispatched() {
    start(async () => {
      const r = await setOrderDispatchedAction(id, !dispatched);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(!dispatched ? "Marcado despachado" : "Despacho deshecho");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
      <div className="hidden md:block">
        <Link href="/pedidos" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Pedidos
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{customer}</h1>
        <span className="text-lg font-mono">{fmt(totalCop)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{new Date(createdAt).toLocaleString("es-CO")}</p>

      {/* Estado + despacho */}
      <Card>
        <CardHeader><CardTitle className="text-base">Estado</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} disabled={pending} onClick={() => changeStatus(s)}>{s}</Button>
            ))}
          </div>
          <Button size="sm" variant={dispatched ? "default" : "outline"} disabled={pending} onClick={toggleDispatched}>
            {dispatched ? "Despachado (deshacer)" : "Marcar despachado"}
          </Button>
          {paymentMethod && <p className="text-xs text-muted-foreground">Pago: {paymentMethod}</p>}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Productos</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{it.cantidad}× {it.nombre}{it.variantLabel ? ` (${it.variantLabel})` : ""}</span>
              <span className="font-mono">{fmt(it.subtotal)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Envío */}
      <Card>
        <CardHeader><CardTitle className="text-base">Envío</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {address ? (
            <>
              <p className="font-medium">{address.destinatario} · {address.telefono}</p>
              <p>{address.direccion}{address.barrio ? `, ${address.barrio}` : ""}</p>
              <p>{address.ciudad}{address.departamento ? `, ${address.departamento}` : ""}</p>
              {address.indicaciones && <p className="text-muted-foreground">{address.indicaciones}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">Sin dirección de despacho.</p>
          )}
          {quote?.carrier && (
            <p className="text-muted-foreground pt-1">
              {quote.carrier}{quote.priceCop != null ? ` · ${fmt(quote.priceCop)}` : ""}{quote.deliveryDays != null ? ` · ${quote.deliveryDays} días` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Comprobante */}
      {comprobanteMediaId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Comprobante</CardTitle></CardHeader>
          <CardContent>
            <img src={`/api/inbox/media/${comprobanteMediaId}`} alt="Comprobante" className="max-h-80 rounded border border-border" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
