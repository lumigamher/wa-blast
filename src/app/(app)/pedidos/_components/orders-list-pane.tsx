"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const handleFilterChange = useCallback(
    (newStatus: OrderStatus | "") => {
      startTransition(() => {
        router.replace(`/pedidos?status=${newStatus}`, { scroll: false });
      });
    },
    [router]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      startTransition(() => {
        router.replace(`/pedidos?status=${currentStatus}&page=${newPage}`, { scroll: false });
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

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-0 space-y-3 border-b p-4 overflow-y-auto">
        <div>
          <h2 className="text-sm font-semibold">Estado</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button
                key={s.value || "todos"}
                size="sm"
                variant={currentStatus === s.value ? "default" : "outline"}
                onClick={() => handleFilterChange(s.value)}
                disabled={isPending}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
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
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/pedidos/${o.id}`}
                  className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${
                    openOrderId === o.id
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium truncate">{o.contactName || o.phone || "Sin cliente"}</span>
                    <span className="text-xs font-mono whitespace-nowrap">{fmt(o.totalCop)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={STATUS_CLS[o.status] ?? ""}>
                      {o.status}
                    </Badge>
                    {o.dispatchedAt && <Badge variant="outline" className="text-emerald-600">Despachado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {o.shippingCity ? `${o.shippingCity} · ` : ""}{new Date(o.createdAt).toLocaleDateString("es-CO")}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {!isLoading && total > pageSize && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage <= 1 || isPending}
                onClick={() => handlePageChange(currentPage - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages || isPending}
                onClick={() => handlePageChange(currentPage + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
