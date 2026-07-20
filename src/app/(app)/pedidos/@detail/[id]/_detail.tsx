"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BanknoteIcon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  MapPinIcon,
  MessageSquareIcon,
  PhoneIcon,
  TruckIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction, setOrderDispatchedAction } from "../../actions";
import type { OrderStatus } from "@/lib/agent/catalog/orders";

type Address = { destinatario?: string; telefono?: string; departamento?: string; ciudad?: string; direccion?: string; barrio?: string; indicaciones?: string };
type Quote = { carrier?: string; priceCop?: number | null; deliveryDays?: number | null };
type Item = { nombre: string; cantidad: number; subtotal: number; precioUnitario: number; variantLabel?: string; imageUrl?: string };

const STEPS = [
  { key: "recibido", label: "Recibido" },
  { key: "confirmado", label: "Confirmado" },
  { key: "pagado", label: "Pagado" },
  { key: "despachado", label: "Despachado" },
] as const;

function stepIndex(status: string, dispatched: boolean): number {
  if (dispatched) return 3;
  if (status === "pagado") return 2;
  if (status === "confirmado") return 1;
  return 0;
}

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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fmt = (cop: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);
  const displayName = contactName || phone || "Sin cliente";
  const cancelled = status === "cancelado";
  const current = stepIndex(status, dispatched);

  function changeStatus(s: OrderStatus, msg: string) {
    start(async () => {
      const r = await updateOrderStatusAction(id, s);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(msg);
      router.refresh();
    });
  }
  function setDispatched(value: boolean) {
    start(async () => {
      const r = await setOrderDispatchedAction(id, value);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(value ? "Pedido despachado" : "Despacho deshecho");
      router.refresh();
    });
  }

  const copyAddress = () => {
    const parts = [address?.direccion, address?.barrio, address?.ciudad].filter(Boolean).join(", ");
    navigator.clipboard.writeText(parts);
    toast.success("Dirección copiada");
  };

  // CTA primario según el siguiente paso del flujo
  const primary = cancelled
    ? null
    : !dispatched && status === "pendiente"
      ? { label: "Confirmar pedido", icon: CheckIcon, run: () => changeStatus("confirmado", "Pedido confirmado") }
      : !dispatched && status === "confirmado"
        ? { label: "Marcar pagado", icon: CreditCardIcon, run: () => changeStatus("pagado", "Pedido marcado pagado") }
        : !dispatched && status === "pagado"
          ? { label: "Marcar despachado", icon: TruckIcon, run: () => setDispatched(true) }
          : null;

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 pb-3 pt-4 pr-12">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-bold">Pedido #{numero ?? "—"}</h1>
          <span className="text-lg font-bold tabular-nums">{fmt(totalCop)}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date(createdAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {city ? ` · ${city}` : ""}
        </p>

        {/* Stepper o banner cancelado */}
        {cancelled ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <XIcon className="size-3.5" />
            Pedido cancelado
          </div>
        ) : (
          <div className="mt-3 flex items-center">
            {STEPS.map((s, i) => (
              <div key={s.key} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
                {i > 0 && (
                  <div className={`mx-1 h-px flex-1 ${i <= current ? "bg-emerald-500" : "bg-border"}`} />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex size-5 items-center justify-center rounded-full border text-[10px] ${
                      i < current
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : i === current
                          ? "border-emerald-500 bg-background font-semibold text-emerald-600"
                          : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {i < current ? <CheckIcon className="size-3" /> : i + 1}
                  </div>
                  <span
                    className={`text-[10px] ${
                      i === current ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 p-4">
        {/* Cliente */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {phone && <p className="text-xs text-muted-foreground">{phone}</p>}
          </div>
          <div className="flex shrink-0 gap-1.5">
            {conversationId && (
              <Link
                href={`/inbox/${conversationId}`}
                title="Abrir chat"
                className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <MessageSquareIcon className="size-4" />
              </Link>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                title="Llamar"
                className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <PhoneIcon className="size-4" />
              </a>
            )}
          </div>
        </div>

        {/* Productos */}
        <div className="rounded-lg border">
          {items.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Sin productos</p>
          ) : (
            <>
              {items.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-0">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-[11px] font-semibold tabular-nums">
                      {it.cantidad}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm">{it.nombre}</p>
                      {it.variantLabel && <p className="text-xs text-muted-foreground">{it.variantLabel}</p>}
                      {it.cantidad > 1 && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">{fmt(it.precioUnitario)} c/u</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{fmt(it.subtotal)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2.5">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold tabular-nums">{fmt(totalCop)}</span>
              </div>
            </>
          )}
        </div>

        {/* Pago */}
        {(paymentMethod || comprobanteMediaId) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {paymentMethod === "contraentrega" ? (
                <BanknoteIcon className="size-4 text-muted-foreground" />
              ) : (
                <CreditCardIcon className="size-4 text-muted-foreground" />
              )}
              <span className="capitalize">{paymentMethod ?? "Pago"}</span>
            </div>
            {comprobanteMediaId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/inbox/media/${comprobanteMediaId}`}
                alt="Comprobante de pago"
                className="max-h-56 rounded-md border"
              />
            )}
          </div>
        )}

        {/* Envío */}
        {(address || quote) && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{address?.destinatario || displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {[address?.direccion, address?.barrio].filter(Boolean).join(" · ") || "Sin dirección"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[address?.ciudad, address?.departamento].filter(Boolean).join(", ")}
                  </p>
                  {address?.indicaciones && (
                    <p className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground">{address.indicaciones}</p>
                  )}
                </div>
              </div>
              {address?.direccion && (
                <button
                  type="button"
                  onClick={copyAddress}
                  title="Copiar dirección"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <CopyIcon className="size-3.5" />
                </button>
              )}
            </div>
            {quote?.carrier && (
              <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <TruckIcon className="size-3.5" /> {quote.carrier}
                  {quote.deliveryDays != null ? ` · ${quote.deliveryDays} días` : ""}
                </span>
                <span className="tabular-nums">{quote.priceCop != null ? fmt(quote.priceCop) : ""}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer de acciones: siguiente paso + secundarias */}
      <div className="sticky bottom-0 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {primary && (
          <Button disabled={pending} onClick={primary.run} className="w-full gap-2">
            <primary.icon className="size-4" />
            {primary.label}
          </Button>
        )}
        {!primary && !cancelled && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckIcon className="size-4" /> Pedido completado
          </div>
        )}
        <div className="mt-2 flex gap-2">
          {cancelled ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => changeStatus("pendiente", "Pedido reactivado")}
              className="flex-1 gap-1.5"
            >
              <Undo2Icon className="size-3.5" /> Reactivar pedido
            </Button>
          ) : (
            <>
              {dispatched && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setDispatched(false)}
                  className="flex-1 gap-1.5"
                >
                  <Undo2Icon className="size-3.5" /> Deshacer despacho
                </Button>
              )}
              {confirmCancel ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    setConfirmCancel(false);
                    changeStatus("cancelado", "Pedido cancelado");
                  }}
                  className="flex-1"
                >
                  Confirmar cancelación
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirmCancel(true)}
                  className="flex-1 text-muted-foreground hover:text-destructive"
                >
                  Cancelar pedido
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
