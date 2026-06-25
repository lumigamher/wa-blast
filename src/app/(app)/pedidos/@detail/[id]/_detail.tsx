"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeftIcon, MessageSquareIcon, PhoneIcon, MapPinIcon, TruckIcon, CreditCardIcon, BoxIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction, setOrderDispatchedAction } from "../../actions";
import type { OrderStatus } from "@/lib/agent/catalog/orders";

const STATUSES: OrderStatus[] = ["pendiente", "confirmado", "pagado", "cancelado"];

type Address = { destinatario?: string; telefono?: string; departamento?: string; ciudad?: string; direccion?: string; barrio?: string; indicaciones?: string };
type Quote = { carrier?: string; priceCop?: number | null; deliveryDays?: number | null };
type Item = { nombre: string; cantidad: number; subtotal: number; precioUnitario: number; variantLabel?: string };

export function OrderDetail({
  id,
  numero,
  status,
  dispatched,
  totalCop,
  paymentMethod,
  comprobanteMediaId,
  contactName,
  phone,
  city,
  conversationId,
  items,
  address,
  quote,
  createdAt,
}: {
  id: string;
  numero: number | null;
  status: string;
  dispatched: boolean;
  totalCop: number;
  paymentMethod: string | null;
  comprobanteMediaId: string | null;
  contactName: string | null;
  phone: string | null;
  city: string | null;
  conversationId: string | null;
  items: Item[];
  address: Address | null;
  quote: Quote | null;
  createdAt: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fmt = (cop: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);
  const displayName = contactName || phone || "Sin cliente";

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

      {/* Header: Pedido # + Status + Date + Total */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pedido #{numero ?? "—"}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(createdAt).toLocaleString("es-CO", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold font-mono">{fmt(totalCop)}</span>
            <p className="text-xs text-muted-foreground mt-1 capitalize">{status}</p>
          </div>
        </div>
      </div>

      {/* Cliente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BoxIcon className="size-4" />
            Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium">{displayName}</p>
            {phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <PhoneIcon className="size-4" />
                {phone}
              </p>
            )}
            {city && <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPinIcon className="size-4" />
              {city}
            </p>}
          </div>
          {conversationId && (
            <Link href={`/inbox/${conversationId}`}>
              <Button size="sm" variant="outline" className="w-full gap-2">
                <MessageSquareIcon className="size-4" />
                Ver chat
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Items / Productos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BoxIcon className="size-4" />
            Productos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin productos</p>
          ) : (
            items.map((it, i) => (
              <div key={i} className="flex justify-between items-start gap-2 pb-2 border-b last:border-0 last:pb-0">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {it.cantidad}× {it.nombre}
                    {it.variantLabel && <span className="text-xs text-muted-foreground ml-1">({it.variantLabel})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(it.precioUnitario)} c/u
                  </p>
                </div>
                <span className="font-mono text-sm font-medium text-right">{fmt(it.subtotal)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pago */}
      {paymentMethod && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCardIcon className="size-4" />
              Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{paymentMethod}</p>
            {comprobanteMediaId && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Comprobante</p>
                <img
                  src={`/api/inbox/media/${comprobanteMediaId}`}
                  alt="Comprobante de pago"
                  className="max-h-80 rounded border border-border"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Envío */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TruckIcon className="size-4" />
            Envío
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {address ? (
            <>
              <div>
                <p className="font-medium">{address.destinatario || "Sin destinatario"}</p>
                {address.telefono && <p className="text-muted-foreground text-xs mt-0.5">{address.telefono}</p>}
              </div>
              <div className="space-y-1 text-muted-foreground">
                {address.direccion && <p>{address.direccion}</p>}
                {address.barrio && <p>{address.barrio}</p>}
                <p>
                  {address.ciudad || "—"}
                  {address.departamento ? `, ${address.departamento}` : ""}
                </p>
                {address.indicaciones && (
                  <p className="text-xs italic border-l-2 border-muted-foreground pl-2 mt-2">
                    {address.indicaciones}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Sin dirección de despacho</p>
          )}
          {quote?.carrier && (
            <div className="pt-2 border-t space-y-1">
              <p className="font-medium text-foreground">{quote.carrier}</p>
              <p className="text-muted-foreground flex justify-between">
                <span>Valor:</span>
                <span className="font-mono">
                  {quote.priceCop != null ? fmt(quote.priceCop) : "—"}
                </span>
              </p>
              {quote.deliveryDays != null && (
                <p className="text-muted-foreground">
                  Entrega: {quote.deliveryDays} días
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acciones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Estado</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={status === s ? "default" : "outline"}
                  disabled={pending}
                  onClick={() => changeStatus(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            variant={dispatched ? "default" : "outline"}
            disabled={pending}
            onClick={toggleDispatched}
            className="w-full"
          >
            {dispatched ? "Despachado (deshacer)" : "Marcar despachado"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
