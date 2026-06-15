import Link from "next/link";
import { LocalDateTime } from "@/components/local-datetime";
import { desc, eq } from "drizzle-orm";
import { CalendarClockIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { campaigns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Campaign = typeof campaigns.$inferSelect;

export default async function CampanasPage() {
  const { orgId } = await requireOrg();
  const all = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(desc(campaigns.createdAt))
    .limit(200);

  const scheduled = all.filter((c) => c.status === "draft" && c.scheduledAt);
  const running = all.filter((c) => c.status === "queued" || c.status === "sending");
  const done = all.filter((c) => c.status === "done" || c.status === "failed");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
          <p className="text-sm text-muted-foreground">Histórico y en curso de tus envíos masivos.</p>
        </div>
        <Link href="/campanas/nueva" className={buttonVariants({ size: "sm" })}>
          <PlusIcon className="size-4" /> Nuevo envío
        </Link>
      </header>

      {scheduled.length > 0 && (
        <Section title="Programadas" icon={<CalendarClockIcon className="size-4" />} subtitle={`${scheduled.length}`}>
          <ul className="space-y-2">
            {scheduled.map((c) => (
              <ScheduledRow key={c.id} c={c} />
            ))}
          </ul>
        </Section>
      )}

      {running.length > 0 && (
        <Section title="En curso" subtitle={`${running.length}`}>
          <ul className="space-y-2">
            {running.map((c) => (
              <CampaignRow key={c.id} c={c} accent />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Finalizadas" subtitle={`${done.length}`}>
        {done.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aún no hay campañas finalizadas.
          </div>
        ) : (
          <ul className="space-y-2">
            {done.map((c) => (
              <CampaignRow key={c.id} c={c} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
          {subtitle && <span className="text-xs font-normal text-muted-foreground">· {subtitle}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function CampaignRow({ c, accent }: { c: Campaign; accent?: boolean }) {
  const done = c.sent + c.failed;
  const pct = c.total > 0 ? (done / c.total) * 100 : 0;
  return (
    <li className={`rounded-md border p-3 ${accent ? "border-blue-300 bg-blue-50/40" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <Link href={`/campanas/${c.id}`} className="flex-1 min-w-0 text-sm font-medium hover:underline">
          {c.name}
        </Link>
        <Badge variant="outline" className="font-mono text-xs">
          {c.templateName}
        </Badge>
        <StatusBadge status={c.status} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Progress value={pct} className="flex-1" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {done}/{c.total}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>✓ {c.sent} enviados</span>
        <span>✗ {c.failed} fallidos</span>
        <span>📨 {c.delivered} entregados</span>
        <span>👁 {c.read} leídos</span>
        <span>💬 {c.replied} respondieron</span>
      </div>
    </li>
  );
}

function ScheduledRow({ c }: { c: Campaign }) {
  const when = c.scheduledAt ? new Date(c.scheduledAt) : null;
  return (
    <li className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50/40 p-3">
      <CalendarClockIcon className="size-4 text-amber-600" />
      <div className="flex-1 min-w-0">
        <Link href={`/campanas/${c.id}`} className="text-sm font-medium hover:underline">
          {c.name}
        </Link>
        <div className="text-xs text-muted-foreground">
          Se enviará{" "}
          <LocalDateTime iso={when ? when.toISOString() : null} fallback="pronto" /> · {c.total}{" "}
          destinatarios
        </div>
      </div>
      <Badge variant="outline" className="font-mono text-xs">
        {c.templateName}
      </Badge>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "done"
      ? "default"
      : status === "failed"
        ? "destructive"
        : status === "sending"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
