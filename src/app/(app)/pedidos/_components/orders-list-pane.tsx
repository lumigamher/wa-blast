"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FilterDialog } from "@/app/(app)/_components/filter-dialog";
import { getOrdersData } from "../actions";
import type { OrderListItem, OrderStatus } from "@/lib/agent/catalog/orders";

const STATUSES: Array<{ value: OrderStatus | ""; label: string }> = [
  { value: "", label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "pagado", label: "Pagado" },
  { value: "cancelado", label: "Cancelado" },
];

const STATUS_CLS: Record<string, string> = {
  pendiente: "text-amber-600",
  confirmado: "text-blue-600",
  pagado: "text-emerald-600",
  cancelado: "text-red-600",
};

export function OrdersListPane() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const currentStatus = (searchParams.get("status") ?? "") as OrderStatus | "";
  const currentPage = parseInt(searchParams.get("page") ?? "1", 10);

  const [data, setData] = useState<{ orders: OrderListItem[]; total: number; page: number; pageSize: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Draft state for filter dialog
  const [draftStatus, setDraftStatus] = useState(currentStatus);

  // Load data on mount and when filters change
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      const result = await getOrdersData({ status: currentStatus || undefined, page: currentPage });
      if (isMounted) {
        setData(result);
        setIsLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [currentStatus, currentPage]);

  const handleFilterOpen = useCallback(() => {
    setDraftStatus(currentStatus);
  }, [currentStatus]);

  const handleApplyFilters = useCallback(() => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (draftStatus) {
        params.set("status", draftStatus);
      }
      router.replace(`/pedidos${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    });
  }, [draftStatus, router]);

  const handleClearFilters = useCallback(() => {
    setDraftStatus("");
    startTransition(() => {
      router.replace("/pedidos", { scroll: false });
    });
  }, [router]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      startTransition(() => {
        const params = new URLSearchParams();
        if (currentStatus) {
          params.set("status", currentStatus);
        }
        params.set("page", newPage.toString());
        router.replace(`/pedidos${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
      });
    },
    [router, currentStatus]
  );

  const fmt = (cop: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 30;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Extract the current open order id from pathname
  const openOrderId = pathname.match(/^\/pedidos\/([^/]+)$/)?.[1];

  const activeFilterCount = currentStatus ? 1 : 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-0 space-y-3 border-b p-4 overflow-y-auto">
        <FilterDialog
          activeCount={activeFilterCount}
          onOpen={handleFilterOpen}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        >
          {/* Estado */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Estado</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.value || "todos"}
                  onClick={() => setDraftStatus(s.value)}
                  className={`text-xs py-2 px-3 rounded border transition-colors ${
                    draftStatus === s.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </FilterDialog>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {total} pedido{total !== 1 ? "s" : ""} · Página {currentPage} de {totalPages}
            </p>
          </div>

          {isLoading && <p className="text-xs text-muted-foreground">Cargando...</p>}

          {!isLoading && orders.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No hay pedidos.</p>}

          {!isLoading && orders.length > 0 && (
            <div className="space-y-2">
              {orders.map((o) => {
                const qs = searchParams.toString();
                return (
                <Link
                  key={o.id}
                  href={`/pedidos/${o.id}${qs ? `?${qs}` : ""}`}
                  className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${
                    openOrderId === o.id
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium truncate">{o.contactName || o.phone || "Sin cliente"}</span>
                    <span className="text-xs font-mono whitespace-nowrap">#{o.numero ?? "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={STATUS_CLS[o.status] ?? ""}>
                        {o.status}
                      </Badge>
                      {o.dispatchedAt && <Badge variant="outline" className="text-emerald-600">Despachado</Badge>}
                    </div>
                    <span className="text-xs font-mono whitespace-nowrap">{fmt(o.totalCop)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {o.shippingCity ? `${o.shippingCity} · ` : ""}{new Date(o.createdAt).toLocaleDateString("es-CO")}
                  </p>
                </Link>
                );
              })}
            </div>
          )}

          {!isLoading && total > pageSize && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
