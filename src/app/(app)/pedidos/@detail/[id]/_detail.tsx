"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MessageSquareIcon, PhoneIcon, TruckIcon, CreditCardIcon, Package } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction, setOrderDispatchedAction } from "../../actions";
import type { OrderStatus } from "@/lib/agent/catalog/orders";

const STATUSES: OrderStatus[] = ["pendiente", "confirmado", "pagado", "cancelado"];

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

type Address = { destinatario?: string; telefono?: string; departamento?: string; ciudad?: string; direccion?: string; barrio?: string; indicaciones?: string };
type Quote = { carrier?: string; priceCop?: number | null; deliveryDays?: number | null };
type Item = { nombre: string; cantidad: number; subtotal: number; precioUnitario: number; variantLabel?: string; imageUrl?: string };

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
    <div className="flex flex-col min-h-0 overflow-y-auto">
      {/* Header bar */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">Pedido #{numero ?? "—"}</h1>
            <p className="text-xs text-muted-foreground">
              {new Date(createdAt).toLocaleString("es-CO", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="ml-4 text-right flex-shrink-0">
            <div className="text-xl font-bold font-mono">{fmt(totalCop)}</div>
            <div className="text-xs text-muted-foreground capitalize">{STATUS_LABELS[status] || status}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PhoneIcon className="size-4" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm font-medium">{displayName}</p>
              {phone && (
                <p className="text-xs text-muted-foreground mt-1">{phone}</p>
              )}
              {city && (
                <p className="text-xs text-muted-foreground mt-0.5">{city}</p>
              )}
            </div>
            {conversationId && (
              <Link href={`/inbox/${conversationId}`}>
                <Button size="sm" variant="outline" className="w-full gap-2 mt-2">
                  <MessageSquareIcon className="size-4" />
                  Ver chat
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Comanda: Productos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="size-4" />
              Productos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sin productos</p>
            ) : (
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div key={i} className="flex gap-3 pb-3 border-b last:pb-0 last:border-0">
                    {/* Product thumbnail */}
                    <div className="flex-shrink-0">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.imageUrl}
                          alt={it.nombre}
                          className="size-12 rounded object-cover border border-border bg-muted"
                        />
                      ) : (
                        <div className="size-12 rounded border border-border bg-muted flex items-center justify-center text-muted-foreground">
                          <Package className="size-5" />
                        </div>
                      )}
                    </div>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{it.nombre}</p>
                          {it.variantLabel && (
                            <p className="text-xs text-muted-foreground">{it.variantLabel}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {it.cantidad}× {fmt(it.precioUnitario)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-medium font-mono">{fmt(it.subtotal)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Subtotal line */}
                <div className="pt-2 border-t flex justify-between items-center">
                  <p className="text-sm font-medium">Total</p>
                  <p className="text-base font-bold font-mono">{fmt(totalCop)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pago */}
        {paymentMethod && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCardIcon className="size-4" />
                Pago
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{paymentMethod}</p>
              {comprobanteMediaId && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Comprobante</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/inbox/media/${comprobanteMediaId}`}
                    alt="Comprobante de pago"
                    className="max-h-64 rounded border border-border"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Envío */}
        {(address || quote) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TruckIcon className="size-4" />
                Envío
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {address ? (
                <div>
                  <p className="font-medium text-sm">{address.destinatario || "Sin destinatario"}</p>
                  {address.telefono && <p className="text-xs text-muted-foreground mt-0.5">{address.telefono}</p>}
                  <div className="space-y-0.5 mt-2 text-xs text-muted-foreground">
                    {address.direccion && <p>{address.direccion}</p>}
                    {address.barrio && <p>{address.barrio}</p>}
                    <p>
                      {address.ciudad || "—"}
                      {address.departamento ? `, ${address.departamento}` : ""}
                    </p>
                    {address.indicaciones && (
                      <p className="italic border-l-2 border-muted-foreground pl-2 mt-2 text-muted-foreground">
                        {address.indicaciones}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">Sin dirección de despacho</p>
              )}
              {quote?.carrier && (
                <div className="pt-2 border-t space-y-1">
                  <p className="font-medium text-sm">{quote.carrier}</p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Valor:</span>
                    <span className="font-mono">
                      {quote.priceCop != null ? fmt(quote.priceCop) : "—"}
                    </span>
                  </div>
                  {quote.deliveryDays != null && (
                    <p className="text-xs text-muted-foreground">
                      Entrega: {quote.deliveryDays} días
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Acciones */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Acciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Estado</p>
              <div className="grid grid-cols-2 gap-2">
                {STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={status === s ? "default" : "outline"}
                    disabled={pending}
                    onClick={() => changeStatus(s)}
                    className="text-xs"
                  >
                    {STATUS_LABELS[s]}
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
    </div>
  );
}
