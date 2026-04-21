import {
  ActivityIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  ZapIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { env } from "@/lib/env";
import {
  metaApi,
  TIER_LIMITS,
  type ConversationAnalyticsPoint,
  type MessagingTier,
  type QualityRating,
} from "@/lib/meta";

export const dynamic = "force-dynamic";

const QUALITY_STYLE: Record<
  QualityRating,
  { label: string; color: string; bg: string; desc: string }
> = {
  GREEN: {
    label: "Alta",
    color: "text-emerald-700",
    bg: "bg-emerald-100",
    desc: "Tu número tiene buena reputación. Sigue cuidando relevancia y opt-in.",
  },
  YELLOW: {
    label: "Media",
    color: "text-amber-700",
    bg: "bg-amber-100",
    desc: "Algunos usuarios están reportando tus mensajes. Reduce frecuencia y revisa contenido.",
  },
  RED: {
    label: "Baja",
    color: "text-destructive",
    bg: "bg-destructive/10",
    desc: "Alerta: si sigue bajando, Meta restringe tu cuenta. Pausa marketing y revisa contenido.",
  },
  UNKNOWN: {
    label: "Sin calificación",
    color: "text-muted-foreground",
    bg: "bg-muted",
    desc: "Meta aún no asigna una calificación. Empieza a enviar para generarla.",
  },
};

const TIER_LABEL: Record<MessagingTier, string> = {
  TIER_50: "50 conv./24h",
  TIER_250: "250 conv./24h",
  TIER_1K: "1 000 conv./24h",
  TIER_10K: "10 000 conv./24h",
  TIER_100K: "100 000 conv./24h",
  TIER_UNLIMITED: "Ilimitado",
};

function resolveTier(
  metaTier: MessagingTier | undefined,
  override: string | undefined,
): {
  tierLimit: number | null;
  tierLabel: string;
  tierSource: "meta" | "override" | null;
} {
  if (metaTier) {
    return {
      tierLimit: TIER_LIMITS[metaTier],
      tierLabel: TIER_LABEL[metaTier],
      tierSource: "meta",
    };
  }
  if (override) {
    const t = override.trim().toUpperCase();
    if (t === "UNLIMITED" || t === "TIER_UNLIMITED") {
      return {
        tierLimit: Number.POSITIVE_INFINITY,
        tierLabel: "Ilimitado (manual)",
        tierSource: "override",
      };
    }
    const n = Number(override.replace(/[^\d]/g, ""));
    if (n > 0) {
      return {
        tierLimit: n,
        tierLabel: `${n.toLocaleString("es-CO")} conv./24h (manual)`,
        tierSource: "override",
      };
    }
  }
  return { tierLimit: null, tierLabel: "Sin asignar", tierSource: null };
}

const CATEGORY_LABEL: Record<string, string> = {
  UTILITY: "Utility",
  MARKETING: "Marketing",
  AUTHENTICATION: "Auth",
  SERVICE: "Servicio",
  REFERRAL_CONVERSION: "Referral",
};

function startOfDayEpoch(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return Math.floor(copy.getTime() / 1000);
}

export default async function SaludPage() {
  const metaReady = Boolean(
    env.META_WABA_ID && env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID,
  );

  if (!metaReady) {
    return (
      <div className="space-y-6">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Salud WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Estado y límites de tu número en Meta.
          </p>
        </header>
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Configura <code>META_WABA_ID</code>, <code>META_PHONE_NUMBER_ID</code>{" "}
          y <code>META_ACCESS_TOKEN</code> en <code>.env.local</code> y
          reinicia la app.
        </div>
      </div>
    );
  }

  const now = new Date();
  const today = startOfDayEpoch(now);
  const thirtyDaysAgo = today - 30 * 86400;

  const [healthResult, analyticsResult] = await Promise.allSettled([
    metaApi.getPhoneHealth(),
    metaApi.getConversationAnalytics({
      startEpoch: thirtyDaysAgo,
      endEpoch: Math.floor(now.getTime() / 1000),
      granularity: "DAILY",
    }),
  ]);

  const health =
    healthResult.status === "fulfilled" ? healthResult.value : null;
  const healthError =
    healthResult.status === "rejected"
      ? String((healthResult.reason as Error)?.message ?? healthResult.reason)
      : null;

  const points: ConversationAnalyticsPoint[] =
    analyticsResult.status === "fulfilled"
      ? analyticsResult.value.conversation_analytics?.data?.[0]?.data_points ?? []
      : [];
  const analyticsError =
    analyticsResult.status === "rejected"
      ? String(
          (analyticsResult.reason as Error)?.message ?? analyticsResult.reason,
        )
      : null;

  // agrupar por día y por categoría para tabla
  const byDay = new Map<
    string,
    { date: string; total: number; businessInitiated: number; byCat: Record<string, number> }
  >();
  let todayBusinessInitiated = 0;
  let monthTotal = 0;
  const catTotals: Record<string, number> = {};

  for (const p of points) {
    const d = new Date(p.start * 1000);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key) ?? {
      date: key,
      total: 0,
      businessInitiated: 0,
      byCat: {},
    };
    row.total += p.conversation;
    if (p.conversation_direction === "BUSINESS_INITIATED") {
      row.businessInitiated += p.conversation;
      if (p.start >= today) todayBusinessInitiated += p.conversation;
    }
    if (p.conversation_category) {
      row.byCat[p.conversation_category] =
        (row.byCat[p.conversation_category] ?? 0) + p.conversation;
      catTotals[p.conversation_category] =
        (catTotals[p.conversation_category] ?? 0) + p.conversation;
    }
    monthTotal += p.conversation;
    byDay.set(key, row);
  }
  const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  const quality = (health?.quality_rating ?? "UNKNOWN") as QualityRating;
  const qStyle = QUALITY_STYLE[quality] ?? QUALITY_STYLE.UNKNOWN;
  const tier = health?.messaging_limit_tier;

  // Resolver límite: prioriza valor de Meta, luego override manual
  const { tierLimit, tierLabel, tierSource } = resolveTier(
    tier,
    env.META_TIER_OVERRIDE,
  );

  const tierPct =
    tierLimit && Number.isFinite(tierLimit) && tierLimit > 0
      ? Math.min(100, (todayBusinessInitiated / tierLimit) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Salud WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Estado y consumo de tu número {health?.display_phone_number ?? ""}
        </p>
      </header>

      {healthError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          Error al leer salud del número: {healthError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardDescription className="text-[11px] uppercase tracking-wider">
              Calidad del número
            </CardDescription>
            <ShieldCheckIcon className={`size-4 ${qStyle.color}`} />
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${qStyle.bg} ${qStyle.color}`}
              >
                {quality}
              </span>
              <span className="text-sm font-medium">{qStyle.label}</span>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {qStyle.desc}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardDescription className="text-[11px] uppercase tracking-wider">
              Límite de tier
            </CardDescription>
            <TrendingUpIcon className="size-4 text-blue-600" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="text-xl font-semibold">{tierLabel}</div>
            <p className="text-[11px] text-muted-foreground">
              {tierSource === "override"
                ? "Definido en .env.local (Meta no expone el tier vía Graph API). Ajústalo si tu tier cambia en Business Manager."
                : "Conversaciones nuevas que tu negocio puede iniciar en 24h."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardDescription className="text-[11px] uppercase tracking-wider">
              Throughput
            </CardDescription>
            <ZapIcon className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="text-xl font-semibold">
              {health?.throughput?.level === "HIGH"
                ? "Alto (1 000 msg/s)"
                : health?.throughput?.level === "STANDARD"
                  ? "Estándar (80 msg/s)"
                  : "—"}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Velocidad máxima de envío por segundo.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardDescription className="text-[11px] uppercase tracking-wider">
              Nombre verificado
            </CardDescription>
            <ActivityIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="truncate text-base font-semibold">
              {health?.verified_name ?? "—"}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Estado: {health?.name_status ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Consumo de hoy vs. límite del tier
          </CardTitle>
          <CardDescription>
            Meta cuenta "conversaciones business-initiated" (ventanas de 24h
            abiertas por tu número). Tu tier actual permite{" "}
            {tierLimit && Number.isFinite(tierLimit)
              ? `${tierLimit.toLocaleString("es-CO")} por día.`
              : "una cantidad ilimitada."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-semibold tabular-nums">
              {todayBusinessInitiated.toLocaleString("es-CO")}
            </span>
            <span className="text-sm text-muted-foreground">
              de{" "}
              {tierLimit && Number.isFinite(tierLimit)
                ? tierLimit.toLocaleString("es-CO")
                : "∞"}{" "}
              permitidas
            </span>
          </div>
          <Progress value={tierPct} />
          <p className="text-[11px] text-muted-foreground">
            {tierPct >= 90
              ? "⚠ Estás muy cerca del límite del día. Evita enviar más o Meta rechazará los intentos."
              : tierPct >= 70
                ? "Llevas una buena parte del día consumida. Reserva capacidad para respuestas urgentes."
                : "Tienes holgura suficiente en el tier."}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Consumo diario (últimos 30 días)
            </CardTitle>
            <CardDescription>
              Conversaciones contadas por Meta (BUSINESS_INITIATED +
              USER_INITIATED).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Error al leer analytics: {analyticsError}
              </div>
            ) : days.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin datos aún en este rango.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium">Fecha</th>
                      <th className="py-2 text-right font-medium">
                        Iniciadas
                      </th>
                      <th className="py-2 text-right font-medium">Total</th>
                      <th className="py-2 px-2 text-left font-medium">
                        Barra
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => {
                      const max = Math.max(...days.map((x) => x.total), 1);
                      const pct = (d.total / max) * 100;
                      return (
                        <tr key={d.date} className="border-b last:border-0">
                          <td className="py-1.5 font-mono">{d.date}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {d.businessInitiated.toLocaleString("es-CO")}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {d.total.toLocaleString("es-CO")}
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="h-2 w-full rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por categoría</CardTitle>
            <CardDescription>30 días</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(catTotals).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              Object.entries(catTotals)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, n]) => {
                  const pct = monthTotal > 0 ? (n / monthTotal) * 100 : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline">
                          {CATEGORY_LABEL[cat] ?? cat}
                        </Badge>
                        <span className="tabular-nums">
                          {n.toLocaleString("es-CO")}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
            <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
              Total 30 días: {monthTotal.toLocaleString("es-CO")} conv.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
