import { desc, eq, sql } from "drizzle-orm";
import {
  ArrowRight,
  CheckCircle2Icon,
  FileTextIcon,
  PlusIcon,
  SendIcon,
  TrendingUpIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { campaigns } from "@/lib/db/schema";
import { credsFromSettings, listTemplates } from "@/lib/meta/graph";
import { getOrgSettings } from "@/lib/org/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { orgId, session } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);

  const startOfMonthTs = Math.floor(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() /
      1000,
  );

  const [recent, running, monthStats, templates] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(eq(campaigns.orgId, orgId))
      .orderBy(desc(campaigns.createdAt))
      .limit(5),
    db
      .select()
      .from(campaigns)
      .where(
        sql`${campaigns.orgId} = ${orgId} AND ${campaigns.status} IN ('queued','sending')`,
      )
      .orderBy(desc(campaigns.createdAt))
      .limit(1),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${campaigns.total}), 0)`,
        sent: sql<number>`COALESCE(SUM(${campaigns.sent}), 0)`,
        failed: sql<number>`COALESCE(SUM(${campaigns.failed}), 0)`,
      })
      .from(campaigns)
      .where(
        sql`${campaigns.orgId} = ${orgId} AND ${campaigns.createdAt} >= ${startOfMonthTs}`,
      ),
    creds ? listTemplates(creds).catch(() => []) : Promise.resolve([]),
  ]);

  const runningCamp = running[0];
  const stats = monthStats[0] ?? { total: 0, sent: 0, failed: 0 };
  const approved = templates.filter((t) => t.status === "APPROVED").length;
  const pending = templates.filter((t) => t.status === "PENDING").length;
  const monthProcessed = Number(stats.sent) + Number(stats.failed);
  const successRate =
    monthProcessed > 0
      ? Math.round((Number(stats.sent) / monthProcessed) * 100)
      : 0;
  const firstName = (session.user.name ?? session.user.email).split(" ")[0];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola {firstName}
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
            href="/campanas/nueva"
            className={buttonVariants({ size: "lg" })}
          >
            <SendIcon className="size-4" />
            Nuevo envío
          </Link>
        </div>
      </header>

      {runningCamp && (
        <Card className="border-blue-300 bg-blue-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="size-2 animate-pulse rounded-full bg-blue-500" />
                <span className="text-sm font-semibold">Campaña en curso</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {runningCamp.templateName}
                </Badge>
              </div>
              <div className="min-w-[260px]">
                <Progress
                  value={
                    runningCamp.total > 0
                      ? ((runningCamp.sent + runningCamp.failed) /
                          runningCamp.total) *
                        100
                      : 0
                  }
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  {runningCamp.sent + runningCamp.failed} / {runningCamp.total}{" "}
                  procesados · {runningCamp.failed} fallidos
                </div>
              </div>
            </div>
            <Link
              href={`/campanas/${runningCamp.id}`}
              className={buttonVariants({ size: "sm" })}
            >
              Ver detalle <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Enviados este mes"
          value={Number(stats.sent).toLocaleString("es-CO")}
          icon={SendIcon}
          color="text-emerald-600"
          hint={`${Number(stats.total).toLocaleString("es-CO")} totales`}
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
          value={Number(stats.failed).toLocaleString("es-CO")}
          icon={XCircleIcon}
          color={
            Number(stats.failed) > 0
              ? "text-amber-600"
              : "text-muted-foreground"
          }
        />
        <MetricCard
          label="Plantillas listas"
          value={`${approved}`}
          icon={CheckCircle2Icon}
          color="text-foreground"
          hint={
            pending > 0
              ? `${pending} en aprobación`
              : creds
                ? undefined
                : "Configura Meta"
          }
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Últimas campañas</CardTitle>
            <CardDescription>Las 5 más recientes.</CardDescription>
          </div>
          {recent.length > 0 && (
            <Link
              href="/campanas"
              className="text-sm text-primary hover:underline flex items-center gap-1 w-fit"
            >
              Ver todas <ArrowRight className="size-3.5" />
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyBatches />
          ) : (
            <ul className="space-y-2">
              {recent.map((c) => {
                const done = c.sent + c.failed;
                const pct = c.total > 0 ? (done / c.total) * 100 : 0;
                return (
                  <li
                    key={c.id}
                    className="rounded-md border bg-background p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/campanas/${c.id}`}
                        className="flex-1 min-w-0 text-sm font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <Badge variant="outline" className="font-mono text-xs">
                        {c.templateName}
                      </Badge>
                      <Badge
                        variant={c.status === "done" ? "default" : "secondary"}
                      >
                        {c.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={pct} className="flex-1" />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {done}/{c.total}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
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
        <div className={`text-3xl font-semibold tabular-nums ${color}`}>
          {value}
        </div>
        {hint && (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyBatches() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-10 text-center">
      <FileTextIcon className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <div className="text-sm font-medium">Aún no hay campañas</div>
        <div className="text-xs text-muted-foreground">
          Crea tu primera campaña desde Nuevo envío.
        </div>
      </div>
      <Link
        href="/campanas/nueva"
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        Empezar
      </Link>
    </div>
  );
}
