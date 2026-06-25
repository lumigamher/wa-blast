"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "lucide-react";
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
  pendiente: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800",
  confirmado: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
  pagado: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800",
  cancelado: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  for (const [key, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      if (interval === 1) return `Hace 1 ${key}`;
      if (
        key === "year" ||
        key === "month" ||
        key === "week" ||
        key === "day"
      ) {
        return `Hace ${interval} ${key}s`;
      }
      return `Hace ${interval} ${key}s`;
    }
  }
  return "Hace unos segundos";
}

export function OrdersListPane() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const currentStatus = (searchParams.get("status") ?? "") as OrderStatus | "";
  const currentPage = parseInt(searchParams.get("page") ?? "1", 10);
  const q = searchParams.get("q") ?? undefined;

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
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      {/* Search */}
      <form className="relative" onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newQ = (formData.get("q") as string) || undefined;
        const params = new URLSearchParams();
        if (newQ) params.set("q", newQ);
        if (currentStatus) params.set("status", currentStatus);
        router.replace(`/pedidos${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
      }}>
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar…"
          className="pl-8"
        />
      </form>

      {/* Filters Button */}
      <div className="flex gap-2">
        <FilterDialog
          activeCount={activeFilterCount}
          onOpen={handleFilterOpen}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        >
          {/* Estado */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Estado</label>
            <div className="grid grid-cols-2 gap-2">
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

      {/* Orders List */}
      <div className="space-y-1 flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && orders.length === 0 && (
          <Card className="p-3">
            <p className="text-xs text-muted-foreground text-center">
              {q ? "No hay pedidos" : "Tu lista de pedidos está vacía"}
            </p>
          </Card>
        )}

        {!isLoading && orders.length > 0 && (
          <>
            <div className="px-1 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                {total} pedido{total !== 1 ? "s" : ""} · Página {currentPage} de {totalPages}
              </p>
            </div>
            <div className="space-y-1">
              {orders.map((o) => {
                const qs = searchParams.toString();
                const isActive = openOrderId === o.id;

                return (
                  <Link
                    key={o.id}
                    href={`/pedidos/${o.id}${qs ? `?${qs}` : ""}`}
                    scroll={false}
                    className={`block p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors group ${
                      isActive ? "bg-accent border-primary" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="text-sm font-medium truncate">
                            {o.contactName || o.phone || "Sin cliente"}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          Pedido #{o.numero ?? "—"} · {o.shippingCity || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-medium">{fmt(o.totalCop)}</div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] mt-0.5 ${STATUS_CLS[o.status] ?? ""}`}
                          >
                            {o.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {formatRelativeTime(o.createdAt)}
                      {o.dispatchedAt && <span className="ml-2 font-medium text-emerald-600">Despachado</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {!isLoading && total > pageSize && (
          <div className="flex items-center justify-between gap-2 pt-4">
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
  );
}
