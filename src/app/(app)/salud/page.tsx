import Link from "next/link";
import { HeartPulseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { TIER_LIMITS, credsFromSettings, getPhoneHealth } from "@/lib/meta/graph";
import { countRecentDrops } from "@/lib/meta/webhook-drops";

export const dynamic = "force-dynamic";

export default async function SaludPage() {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);

  if (!creds) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Salud WhatsApp</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Configura tus credenciales de Meta en{" "}
          <Link href="/configuracion/meta" className="underline">
            Configuración
          </Link>{" "}
          para ver la salud de tu número.
        </div>
      </div>
    );
  }

  // Webhooks que Meta entregó y no pudimos interpretar. Meta exige responder 200
  // igual, así que sin este número un cambio de formato se traduce en mensajes
  // perdidos sin que nadie se entere.
  const descartes = await countRecentDrops(db, 24).catch(() => 0);

  const health = await getPhoneHealth(creds).catch((e) => {
    console.error("getPhoneHealth failed:", e);
    return null;
  });

  if (!health) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Salud WhatsApp</h1>
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudo consultar Meta. Verifica las credenciales y permisos del token.
        </div>
      </div>
    );
  }

  const tier = health.messaging_limit_tier;
  const limit = tier ? TIER_LIMITS[tier] : null;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <HeartPulseIcon className="size-6 text-red-500" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Salud WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Estado del número {health.display_phone_number}</p>
        </div>
      </header>

      {descartes > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong>{descartes}</strong>{" "}
          {descartes === 1 ? "webhook entrante no se pudo interpretar" : "webhooks entrantes no se pudieron interpretar"}{" "}
          en las últimas 24 horas. Puede que Meta haya cambiado el formato del payload: esos mensajes no llegaron al
          inbox. Quedaron guardados para poder revisarlos.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px] uppercase tracking-wider">Quality</CardDescription>
          </CardHeader>
          <CardContent>
            <QualityBadge q={health.quality_rating ?? "UNKNOWN"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px] uppercase tracking-wider">Tier diario</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {limit === Number.POSITIVE_INFINITY ? "∞" : limit?.toLocaleString("es-CO") ?? "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">{tier ?? "no disponible"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px] uppercase tracking-wider">Throughput</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{health.throughput?.level ?? "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px] uppercase tracking-wider">Verificación</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              Nombre: <b>{health.name_status ?? "—"}</b>
            </div>
            <div className="text-sm">
              Código: <b>{health.code_verification_status ?? "—"}</b>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Display phone" value={health.display_phone_number} />
          <Row label="Verified name" value={health.verified_name ?? "—"} />
          <Row label="Phone ID" value={creds.phoneId} mono />
          <Row label="WABA ID" value={creds.wabaId} mono />
        </CardContent>
      </Card>
    </div>
  );
}

function QualityBadge({ q }: { q: string }) {
  const variant = q === "GREEN" ? "default" : q === "YELLOW" ? "secondary" : q === "RED" ? "destructive" : "outline";
  return (
    <Badge variant={variant} className="text-sm px-3 py-1">
      {q}
    </Badge>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
