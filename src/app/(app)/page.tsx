import Link from "next/link";
import {
  CheckCircle2Icon,
  FileTextIcon,
  PlusIcon,
  SendIcon,
  TrendingUpIcon,
  XCircleIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { chatwootApi } from "@/lib/chatwoot";
import { db, type BatchRow } from "@/lib/db";
import { getSession } from "@/lib/session";
import { CleanupDuplicatesCard } from "./_cleanup-card";

export const dynamic = "force-dynamic";

type BatchStats = {
  total: number;
  sent: number;
  failed: number;
};

export default async function Home() {
  const session = await getSession();
  const token = session.user!.chatwootToken;

  const startOfMonth = Math.floor(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
  );

  const [templates, recent, running, monthStats] = await Promise.all([
    chatwootApi.listTemplates(token).catch(() => []),
    Promise.resolve(
      db
        .prepare("SELECT * FROM batches ORDER BY created_at DESC LIMIT 5")
        .all() as BatchRow[],
    ),
    Promise.resolve(
      db
        .prepare(
          "SELECT * FROM batches WHERE status IN ('running','pending') ORDER BY created_at DESC LIMIT 1",
        )
        .get() as BatchRow | undefined,
    ),
    Promise.resolve(
      db
        .prepare(
          "SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(sent), 0) AS sent, COALESCE(SUM(failed), 0) AS failed FROM batches WHERE created_at >= ?",
        )
        .get(startOfMonth) as BatchStats,
    ),
  ]);

  const approved = templates.filter((t) => t.status === "APPROVED").length;
  const pending = templates.filter((t) => t.status === "PENDING").length;
  const monthProcessed = monthStats.sent + monthStats.failed;
  const successRate =
    monthProcessed > 0 ? Math.round((monthStats.sent / monthProcessed) * 100) : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola {session.user!.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu panel de envíos masivos de WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/plantillas/nueva"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <PlusIcon className="size-4" />
            Nueva plantilla
          </Link>
          <Link
            href="/nuevo-envio"
            className={buttonVariants({ size: "lg" })}
          >
            <SendIcon className="size-4" />
            Nuevo envío
          </Link>
        </div>
      </header>

      {running && (
        <Card className="border-blue-300 bg-blue-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="size-2 animate-pulse rounded-full bg-blue-500" />
                <span className="text-sm font-semibold">
                  Batch en curso
                </span>
                <Badge variant="outline" className="font-mono text-xs">
                  {running.template_name}
                </Badge>
              </div>
              <div className="min-w-[260px]">
                <Progress
                  value={
                    running.total > 0
                      ? ((running.sent + running.failed) / running.total) * 100
                      : 0
                  }
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  {running.sent + running.failed} / {running.total}{" "}
                  procesados · {running.failed} fallidos
                </div>
              </div>
            </div>
            <Link
              href={`/historial/${running.id}`}
              className={buttonVariants({ size: "sm" })}
            >
              Ver detalle →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Enviados este mes"
          value={monthStats.sent.toLocaleString("es-CO")}
          icon={SendIcon}
          color="text-emerald-600"
          hint={`${monthStats.total.toLocaleString("es-CO")} totales`}
        />
        <MetricCard
          label="Tasa de éxito"
          value={monthProcessed > 0 ? `${successRate}%` : "—"}
          icon={TrendingUpIcon}
          color="text-blue-600"
          hint={`${monthProcessed.toLocaleString("es-CO")} procesados`}
        />
        <MetricCard
          label="Fallidos este mes"
          value={monthStats.failed.toLocaleString("es-CO")}
          icon={XCircleIcon}
          color={monthStats.failed > 0 ? "text-amber-600" : "text-muted-foreground"}
        />
        <MetricCard
          label="Plantillas listas"
          value={`${approved}`}
          icon={CheckCircle2Icon}
          color="text-foreground"
          hint={pending > 0 ? `${pending} en aprobación` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Últimos envíos</CardTitle>
            <CardDescription>
              Los 5 batches más recientes.
            </CardDescription>
          </div>
          {recent.length > 0 && (
            <Link
              href="/historial"
              className="text-sm text-primary hover:underline"
            >
              Ver todos →
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyBatches />
          ) : (
            <ul className="space-y-2">
              {recent.map((b) => (
                <BatchRowItem key={b.id} batch={b} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CleanupDuplicatesCard />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  hint,
}: {
  label: string;
  value: string;
  icon: typeof SendIcon;
  color: string;
  hint?: string;
}) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-0">
        <CardDescription className="text-[11px] uppercase tracking-wider">
          {label}
        </CardDescription>
        <Icon className={`size-4 ${color}`} />
      </CardHeader>
      <CardContent className="space-y-0.5 pt-0">
        <div
          className={`text-3xl font-semibold tabular-nums ${color}`}
        >
          {value}
        </div>
        {hint && (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function BatchRowItem({ batch }: { batch: BatchRow }) {
  const done = batch.sent + batch.failed;
  const pct = batch.total > 0 ? (done / batch.total) * 100 : 0;
  return (
    <li>
      <Link
        href={`/historial/${batch.id}`}
        className="group flex items-center justify-between gap-4 rounded-md border bg-background px-4 py-3 transition hover:bg-accent"
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="truncate font-mono text-sm font-medium">
            {batch.template_name}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(batch.created_at).toLocaleString("es-CO", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" · "}
            {batch.user_email}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden min-w-[120px] sm:block">
            <Progress value={pct} />
            <div className="mt-1 text-right text-[10px] text-muted-foreground tabular-nums">
              {done}/{batch.total}
            </div>
          </div>
          <StatusBadge status={batch.status} failed={batch.failed} />
        </div>
      </Link>
    </li>
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
        Con {failed} fallo{failed === 1 ? "" : "s"}
      </Badge>
    );
  }
  return <Badge variant="destructive">Falló</Badge>;
}

function EmptyBatches() {
  return (
    <div className="rounded-md border border-dashed py-10 text-center">
      <FileTextIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Aún no has hecho envíos.
      </p>
      <Link
        href="/nuevo-envio"
        className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
      >
        Crear el primer envío →
      </Link>
    </div>
  );
}
