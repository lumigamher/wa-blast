import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db, type BatchRow } from "@/lib/db";

export const dynamic = "force-dynamic";

type Range = "all" | "month" | "7d" | "30d";

type Stats = {
  total: number;
  sent: number;
  failed: number;
  count: number;
};

const RANGES: { value: Range; label: string }[] = [
  { value: "month", label: "Este mes" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "all", label: "Todo" },
];

function rangeStartMs(range: Range): number | null {
  if (range === "all") return null;
  if (range === "month") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  const days = range === "7d" ? 7 : 30;
  return Date.now() - days * 86400_000;
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range: Range = (RANGES.find((r) => r.value === sp.range)?.value ??
    "month") as Range;
  const since = rangeStartMs(range);

  const batchRows = (since != null
    ? (db
        .prepare(
          "SELECT * FROM batches WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200",
        )
        .all(since) as BatchRow[])
    : (db
        .prepare("SELECT * FROM batches ORDER BY created_at DESC LIMIT 200")
        .all() as BatchRow[]));

  const stats: Stats = batchRows.reduce<Stats>(
    (acc, b) => ({
      total: acc.total + b.total,
      sent: acc.sent + b.sent,
      failed: acc.failed + b.failed,
      count: acc.count + 1,
    }),
    { total: 0, sent: 0, failed: 0, count: 0 },
  );
  const processed = stats.sent + stats.failed;
  const successRate =
    processed > 0 ? Math.round((stats.sent / processed) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>
        <p className="text-sm text-muted-foreground">
          Envíos masivos realizados desde este panel.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => {
          const active = range === r.value;
          return (
            <Link
              key={r.value}
              href={r.value === "month" ? "/historial" : `/historial?range=${r.value}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent"
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard label="Batches" value={String(stats.count)} />
        <MetricCard
          label="Enviados"
          value={stats.sent.toLocaleString("es-CO")}
          color="text-emerald-600"
        />
        <MetricCard
          label="Fallidos"
          value={stats.failed.toLocaleString("es-CO")}
          color={stats.failed > 0 ? "text-amber-600" : undefined}
        />
        <MetricCard
          label="Tasa éxito"
          value={processed > 0 ? `${successRate}%` : "—"}
          color="text-blue-600"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batches</CardTitle>
          <CardDescription>
            Click en un batch para ver el detalle de envío e items.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batchRows.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No hay envíos en este periodo.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Fecha</TableHead>
                  <TableHead>Plantilla</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="w-40">Progreso</TableHead>
                  <TableHead className="w-32">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchRows.map((b) => (
                  <TableRow key={b.id} className="group cursor-pointer">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <Link
                        href={`/historial/${b.id}`}
                        className="block"
                      >
                        {new Date(b.created_at).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/historial/${b.id}`}
                        className="block font-mono text-xs text-foreground group-hover:text-primary"
                      >
                        {b.template_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/historial/${b.id}`}
                        className="block text-xs text-muted-foreground"
                      >
                        {b.user_email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/historial/${b.id}`}
                        className="block space-y-1"
                      >
                        <Progress
                          value={
                            b.total > 0
                              ? ((b.sent + b.failed) / b.total) * 100
                              : 0
                          }
                        />
                        <div className="text-right text-[10px] tabular-nums text-muted-foreground">
                          {b.sent}/{b.total}
                          {b.failed > 0 && (
                            <span className="ml-1 text-destructive">
                              · {b.failed}✗
                            </span>
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/historial/${b.id}`} className="block">
                        <StatusBadge status={b.status} failed={b.failed} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums ${color ?? "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  failed,
}: {
  status: BatchRow["status"];
  failed: number;
}) {
  if (status === "running" || status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 text-blue-600">
        <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
        En curso
      </Badge>
    );
  }
  if (status === "completed" && failed === 0) {
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
        Completo
      </Badge>
    );
  }
  if (status === "completed" && failed > 0) {
    return (
      <Badge variant="outline" className="text-amber-700">
        {failed} fallo{failed === 1 ? "" : "s"}
      </Badge>
    );
  }
  return <Badge variant="destructive">Falló</Badge>;
}
