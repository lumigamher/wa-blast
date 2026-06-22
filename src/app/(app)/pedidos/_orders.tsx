"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string; totalCop: number; status: string; dispatchedAt: number | null;
  createdAt: number; phone: string | null; contactName: string | null; shippingCity: string | null;
};

const STATUS_CLS: Record<string, string> = {
  pendiente: "text-amber-600", confirmado: "text-blue-600", pagado: "text-emerald-600", cancelado: "text-red-600",
};
const FILTERS = ["", "pendiente", "confirmado", "pagado", "cancelado"];

export function OrdersList({ items, total, page, pageSize, status }: {
  items: Row[]; total: number; page: number; pageSize: number; status: string;
}) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fmt = (cop: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);
  const go = (s: string, p: number) => router.push(`/pedidos?status=${s}&page=${p}`);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-muted-foreground">Pedidos creados por el agente. Edita el estado o marca despachado.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f || "todos"} size="sm" variant={status === f ? "default" : "outline"} onClick={() => go(f, 1)}>
            {f === "" ? "Todos" : f}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{total} pedido{total !== 1 ? "s" : ""}</CardTitle>
          <CardDescription className="text-xs">Página {page} de {totalPages}</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No hay pedidos.</p>
          ) : (
            <div className="space-y-2">
              {items.map((o) => (
                <Link key={o.id} href={`/pedidos/${o.id}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{o.contactName || o.phone || "Sin cliente"}</span>
                      <Badge variant="outline" className={STATUS_CLS[o.status] ?? ""}>{o.status}</Badge>
                      {o.dispatchedAt && <Badge variant="outline" className="text-emerald-600">Despachado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {o.shippingCity ? `${o.shippingCity} · ` : ""}{new Date(o.createdAt).toLocaleDateString("es-CO")}
                    </p>
                  </div>
                  <span className="text-sm font-mono whitespace-nowrap">{fmt(o.totalCop)}</span>
                </Link>
              ))}
            </div>
          )}
          {total > pageSize && (
            <div className="flex items-center justify-end gap-2 pt-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => go(status, page - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => go(status, page + 1)}>Siguiente</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
