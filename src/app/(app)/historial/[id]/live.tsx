"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BatchItemRow, BatchRow } from "@/lib/db";
import { retryFailedAction } from "./actions";

type StatusKey = BatchItemRow["status"];

const STATUS_INFO: Record<
  StatusKey,
  { label: string; color: string; icon: typeof CircleDashedIcon }
> = {
  pending: {
    label: "Pendiente",
    color: "text-muted-foreground",
    icon: CircleDashedIcon,
  },
  accepted: {
    label: "Aceptado",
    color: "text-blue-600",
    icon: LoaderCircleIcon,
  },
  sent: {
    label: "Enviado",
    color: "text-emerald-600",
    icon: CheckCircle2Icon,
  },
  failed: {
    label: "Falló",
    color: "text-destructive",
    icon: XCircleIcon,
  },
};

const FILTER_CHIPS: { value: StatusKey | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "sent", label: "Enviados" },
  { value: "accepted", label: "Aceptados" },
  { value: "failed", label: "Fallidos" },
  { value: "pending", label: "Pendientes" },
];

export function BatchLive({
  initialBatch,
  initialItems,
}: {
  initialBatch: BatchRow;
  initialItems: BatchItemRow[];
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<StatusKey | "all">("all");
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (batch.status === "completed" || batch.status === "failed") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/batches/${batch.id}/status`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        batch: BatchRow;
        items: BatchItemRow[];
      };
      setBatch(data.batch);
      setItems(data.items);
      if (data.batch.status === "completed" || data.batch.status === "failed") {
        clearInterval(t);
        if (data.batch.failed > 0) {
          toast.warning(
            `Batch terminado: ${data.batch.sent} enviados, ${data.batch.failed} fallidos`,
            { duration: 8000 },
          );
        } else {
          toast.success(`Batch completo: ${data.batch.sent} enviados ✓`);
        }
      }
    }, 1500);
    return () => clearInterval(t);
  }, [batch.id, batch.status]);

  const counters = useMemo(() => {
    const c: Record<StatusKey, number> = {
      pending: 0,
      accepted: 0,
      sent: 0,
      failed: 0,
    };
    for (const it of items) c[it.status]++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && it.status !== filter) return false;
      if (!needle) return true;
      return (
        it.phone.toLowerCase().includes(needle) ||
        (it.name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, filter, q]);

  const done = batch.sent + batch.failed;
  const pct = batch.total > 0 ? (done / batch.total) * 100 : 0;
  const successRate =
    done > 0 ? Math.round((batch.sent / done) * 100) : 0;
  const running = batch.status === "running" || batch.status === "pending";

  const eta = useMemo(() => {
    if (!running || done === 0) return null;
    const elapsed = (Date.now() - batch.created_at) / 1000;
    const rate = done / elapsed;
    if (rate <= 0) return null;
    const remaining = (batch.total - done) / rate;
    if (remaining < 60) return `${Math.round(remaining)}s`;
    if (remaining < 3600) return `${Math.round(remaining / 60)} min`;
    return `${(remaining / 3600).toFixed(1)} h`;
  }, [running, batch.created_at, batch.total, done]);

  function retryFailed() {
    if (counters.failed === 0) return;
    startTransition(async () => {
      const res = await retryFailedAction(batch.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Reintentando ${counters.failed} fallidos en un nuevo batch`,
      );
      router.push(`/historial/${res.batchId}`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Estado"
          value={statusLabel(batch.status)}
          variant={batch.status}
        />
        <StatCard
          label="Enviados"
          value={`${batch.sent} / ${batch.total}`}
          hint={done > 0 ? `${successRate}% éxito` : undefined}
        />
        <StatCard
          label="Fallidos"
          value={String(batch.failed)}
          variant={batch.failed > 0 ? "warn" : undefined}
        />
        <StatCard
          label={running ? "Tiempo restante" : "Duración"}
          value={running ? eta ?? "calculando…" : formatDuration(batch)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {done} de {batch.total} procesados
          </span>
          <span>{Math.round(pct)}%</span>
        </div>
        <Progress value={pct} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((c) => {
            const count =
              c.value === "all" ? items.length : counters[c.value];
            const active = filter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setFilter(c.value)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                }`}
              >
                {c.label}
                <span
                  className={`tabular-nums ${active ? "opacity-80" : "text-muted-foreground"}`}
                >
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
        {counters.failed > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={retryFailed}
            disabled={pending || running}
            title={
              running
                ? "Espera a que termine el batch para reintentar"
                : `Reencolar los ${counters.failed} fallidos en un nuevo batch`
            }
          >
            <RotateCcwIcon className="size-3.5" />
            {pending
              ? "Reintentando…"
              : `Reintentar fallidos (${counters.failed})`}
          </Button>
        )}
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por teléfono o nombre…"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Estado</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Enviado a las</TableHead>
              <TableHead>Error / detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {q || filter !== "all"
                    ? "Ningún item coincide con los filtros"
                    : "Sin items aún"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((it) => {
                const info = STATUS_INFO[it.status];
                const Icon = info.icon;
                return (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div
                        className={`flex items-center gap-1.5 ${info.color}`}
                      >
                        <Icon
                          className={`size-3.5 ${
                            it.status === "accepted" ? "animate-spin" : ""
                          }`}
                        />
                        <span className="text-xs font-medium">
                          {info.label}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {it.phone}
                    </TableCell>
                    <TableCell className="text-sm">
                      {it.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                      {it.sent_at
                        ? new Date(it.sent_at).toLocaleTimeString("es-CO")
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-destructive">
                      {it.error ?? ""}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {batch.retry_of && (
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          Este batch es un reintento de{" "}
          <Link
            href={`/historial/${batch.retry_of}`}
            className="font-mono text-primary hover:underline"
          >
            {batch.retry_of.slice(0, 8)}
          </Link>
          .
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  variant,
}: {
  label: string;
  value: string;
  hint?: string;
  variant?: BatchRow["status"] | "warn";
}) {
  const color =
    variant === "warn"
      ? "text-amber-600"
      : variant === "completed"
        ? "text-emerald-600"
        : variant === "running"
          ? "text-blue-600"
          : variant === "failed"
            ? "text-destructive"
            : "text-foreground";
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-lg font-semibold tabular-nums capitalize ${color}`}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function statusLabel(s: BatchRow["status"]): string {
  const map: Record<BatchRow["status"], string> = {
    pending: "Pendiente",
    running: "En curso",
    completed: "Completado",
    failed: "Falló",
  };
  return map[s];
}

function formatDuration(batch: BatchRow): string {
  if (batch.status !== "completed" && batch.status !== "failed") return "—";
  const elapsedMs = Date.now() - batch.created_at;
  if (elapsedMs < 60_000) return `${Math.round(elapsedMs / 1000)}s`;
  if (elapsedMs < 3_600_000) return `${Math.round(elapsedMs / 60_000)} min`;
  return `${(elapsedMs / 3_600_000).toFixed(1)} h`;
}
