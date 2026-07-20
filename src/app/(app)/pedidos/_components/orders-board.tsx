"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  BanknoteIcon,
  CheckIcon,
  ChefHatIcon,
  CreditCardIcon,
  HistoryIcon,
  InboxIcon,
  MapPinIcon,
  PackageCheckIcon,
  TruckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime, minutesSince } from "@/lib/format/relative-time";
import type { OrderListItem } from "@/lib/agent/catalog/orders";
import {
  getOrdersBoardData,
  setOrderDispatchedAction,
  updateOrderStatusAction,
  type BoardColumnKey,
  type OrdersBoardData,
} from "../actions";

const COLUMNS: {
  key: BoardColumnKey;
  title: string;
  icon: typeof InboxIcon;
  accent: string;
  dot: string;
}[] = [
  { key: "nuevos", title: "Nuevos", icon: InboxIcon, accent: "text-amber-600", dot: "bg-amber-500" },
  { key: "confirmados", title: "Confirmados", icon: ChefHatIcon, accent: "text-sky-600", dot: "bg-sky-500" },
  { key: "pagados", title: "Pagados", icon: CreditCardIcon, accent: "text-emerald-600", dot: "bg-emerald-500" },
  { key: "despachados", title: "Despachados", icon: TruckIcon, accent: "text-muted-foreground", dot: "bg-zinc-400" },
];

function formatCop(n: number): string {
  return `$${n.toLocaleString("es-CO")}`;
}

/** Acción primaria de siguiente paso para un pedido, según su columna. */
function nextStep(col: BoardColumnKey): { label: string; icon: typeof CheckIcon } | null {
  if (col === "nuevos") return { label: "Confirmar", icon: CheckIcon };
  if (col === "confirmados") return { label: "Marcar pagado", icon: CreditCardIcon };
  if (col === "pagados") return { label: "Despachar", icon: TruckIcon };
  return null;
}

function OrderCard({
  order,
  column,
  isNew,
  onAdvance,
  advancing,
}: {
  order: OrderListItem;
  column: BoardColumnKey;
  isNew: boolean;
  onAdvance: (order: OrderListItem, column: BoardColumnKey) => void;
  advancing: boolean;
}) {
  const mins = minutesSince(order.createdAt);
  const urgent = column === "nuevos" && mins >= 10;
  const critical = column === "nuevos" && mins >= 20;
  const step = nextStep(column);
  const itemsSummary = order.items
    .map((i) => `${i.cantidad}× ${i.nombre}`)
    .join(" · ");

  return (
    <div
      className={`group relative rounded-lg border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 ${
        critical
          ? "border-red-300 dark:border-red-900"
          : urgent
            ? "border-amber-300 dark:border-amber-900"
            : ""
      } ${isNew ? "animate-in fade-in slide-in-from-top-2 duration-500 ring-1 ring-emerald-400/60" : ""}`}
    >
      <Link href={`/pedidos/${order.id}`} className="absolute inset-0" aria-label={`Ver pedido ${order.numero ?? ""}`} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold tabular-nums">#{order.numero ?? "—"}</span>
        <span
          className={`text-[11px] tabular-nums ${
            critical
              ? "font-semibold text-red-600"
              : urgent
                ? "font-semibold text-amber-600"
                : "text-muted-foreground"
          }`}
        >
          {formatRelativeTime(order.createdAt)}
        </span>
      </div>
      <div className="mt-0.5 truncate text-sm font-medium">
        {order.contactName || order.phone || "Sin contacto"}
      </div>
      {itemsSummary && (
        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{itemsSummary}</div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">{formatCop(order.totalCop)}</span>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {order.paymentMethod === "transferencia" ? (
            <span className="inline-flex items-center gap-1" title="Transferencia">
              <CreditCardIcon className="size-3" /> Transf.
            </span>
          ) : order.paymentMethod === "contraentrega" ? (
            <span className="inline-flex items-center gap-1" title="Contraentrega">
              <BanknoteIcon className="size-3" /> Efectivo
            </span>
          ) : null}
          {order.shippingBarrio && (
            <span className="inline-flex max-w-24 items-center gap-0.5 truncate" title={order.shippingBarrio}>
              <MapPinIcon className="size-3 shrink-0" />
              <span className="truncate">{order.shippingBarrio}</span>
            </span>
          )}
        </div>
      </div>
      {step && (
        <button
          type="button"
          disabled={advancing}
          onClick={(e) => {
            e.preventDefault();
            onAdvance(order, column);
          }}
          className="relative z-10 mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <step.icon className="size-3.5" />
          {step.label}
        </button>
      )}
    </div>
  );
}

export function OrdersBoard({ initial }: { initial: OrdersBoardData }) {
  const router = useRouter();
  const [data, setData] = useState<OrdersBoardData>(initial);
  const [showHistory, setShowHistory] = useState(false);
  const [mobileTab, setMobileTab] = useState<BoardColumnKey>("nuevos");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const knownIds = useRef<Set<string>>(new Set(initial.columns.nuevos.map((o) => o.id)));
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Polling cada 15s (visible y online), resaltando pedidos nuevos
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden || !navigator.onLine) return;
      startTransition(async () => {
        const fresh = await getOrdersBoardData();
        const incoming = new Set<string>();
        for (const o of fresh.columns.nuevos) {
          if (!knownIds.current.has(o.id)) incoming.add(o.id);
          knownIds.current.add(o.id);
        }
        if (incoming.size > 0) {
          setNewIds(incoming);
          toast.info(incoming.size === 1 ? "Pedido nuevo recibido" : `${incoming.size} pedidos nuevos`);
        }
        setData(fresh);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const refresh = () => {
    startTransition(async () => {
      setData(await getOrdersBoardData());
    });
  };

  const advance = (order: OrderListItem, column: BoardColumnKey) => {
    setAdvancingId(order.id);
    startTransition(async () => {
      const res =
        column === "pagados"
          ? await setOrderDispatchedAction(order.id, true)
          : await updateOrderStatusAction(order.id, column === "nuevos" ? "confirmado" : "pagado");
      setAdvancingId(null);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        column === "nuevos"
          ? `Pedido #${order.numero ?? ""} confirmado`
          : column === "confirmados"
            ? `Pedido #${order.numero ?? ""} marcado pagado`
            : `Pedido #${order.numero ?? ""} despachado`,
      );
      refresh();
      router.refresh();
    });
  };

  const columnSum = (key: BoardColumnKey) =>
    data.columns[key].reduce((a, o) => a + o.totalCop, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      {/* Header del tablero */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">Pedidos</h1>
          <span className="text-xs text-muted-foreground">
            Hoy: <b className="text-foreground">{data.todayCount}</b> pedidos ·{" "}
            <b className="text-foreground tabular-nums">{formatCop(data.todayTotalCop)}</b>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            showHistory ? "bg-accent font-medium" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <HistoryIcon className="size-3.5" />
          Cancelados{data.cancelados.length > 0 ? ` (${data.cancelados.length})` : ""}
        </button>
      </div>

      {showHistory ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {data.cancelados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay pedidos cancelados</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.cancelados.map((o) => (
                <div key={o.id} className="opacity-70">
                  <OrderCard order={o} column="despachados" isNew={false} onAdvance={() => {}} advancing={false} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Tabs móvil */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5 md:hidden">
            {COLUMNS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setMobileTab(c.key)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] transition-colors ${
                  mobileTab === c.key ? "bg-background font-medium shadow-sm" : "text-muted-foreground"
                }`}
              >
                {c.title}
                <span className={`ml-0.5 rounded-full px-1 text-[10px] tabular-nums ${mobileTab === c.key ? c.accent : ""}`}>
                  {data.columns[c.key].length}
                </span>
              </button>
            ))}
          </div>

          {/* Tablero */}
          <div className="min-h-0 flex-1 overflow-x-auto">
            <div className="grid h-full min-w-0 grid-cols-1 gap-3 md:min-w-[860px] md:grid-cols-4">
              {COLUMNS.map((c) => {
                const orders = data.columns[c.key];
                return (
                  <div
                    key={c.key}
                    className={`min-h-0 flex-col rounded-lg border bg-muted/20 ${
                      mobileTab === c.key ? "flex" : "hidden md:flex"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <span className={`size-1.5 rounded-full ${c.dot}`} aria-hidden />
                        {c.title}
                        <span className="text-muted-foreground tabular-nums">({orders.length})</span>
                      </div>
                      {orders.length > 0 && c.key !== "despachados" && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatCop(columnSum(c.key))}
                        </span>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                      {orders.length === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 py-8 text-muted-foreground">
                          <c.icon className="size-5 opacity-40" />
                          <span className="text-xs">
                            {c.key === "nuevos" ? "Sin pedidos nuevos" : "Vacío"}
                          </span>
                        </div>
                      ) : (
                        orders.map((o) => (
                          <OrderCard
                            key={o.id}
                            order={o}
                            column={c.key}
                            isNew={newIds.has(o.id)}
                            onAdvance={advance}
                            advancing={advancingId === o.id}
                          />
                        ))
                      )}
                      {c.key === "despachados" && orders.length > 0 && (
                        <p className="flex items-center justify-center gap-1 py-1 text-[10px] text-muted-foreground">
                          <PackageCheckIcon className="size-3" /> Últimas 48 horas
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
