"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Campaign = {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  status: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  scheduledAt: string | null;
};

type Recipient = {
  id: number;
  phone: string;
  name: string | null;
  status: string;
  error: string | null;
};

export function Live({ campaignId, initial }: { campaignId: string; initial: Campaign }) {
  const [data, setData] = useState(initial);
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      const [s, r] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/status`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/campaigns/${campaignId}/recipients`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!active) return;
      if (s) setData(s);
      if (r) setRecipients(r);
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [campaignId]);

  const done = data.sent + data.failed;
  const pct = data.total > 0 ? (done / data.total) * 100 : 0;
  const isTerminal = data.status === "done" || data.status === "failed";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/campanas" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Campañas
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          <Badge
            variant={
              data.status === "done"
                ? "default"
                : data.status === "failed"
                  ? "destructive"
                  : data.status === "sending"
                    ? "secondary"
                    : "outline"
            }
          >
            {data.status}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            {data.templateName} · {data.templateLanguage}
          </Badge>
        </div>
        {data.scheduledAt && (
          <p className="text-xs text-amber-700">
            Programada para{" "}
            {new Date(data.scheduledAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Progreso</CardTitle>
          <CardDescription className="text-xs">
            {done} de {data.total} procesados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={pct} />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total" value={data.total} />
        <Stat label="Enviados" value={data.sent} color="text-emerald-600" />
        <Stat label="Entregados" value={data.delivered} color="text-blue-600" />
        <Stat label="Leídos" value={data.read} color="text-indigo-600" />
        <Stat label="Fallidos" value={data.failed} color="text-red-600" />
        <Stat label="Respondieron" value={data.replied} color="text-amber-600" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Destinatarios</CardTitle>
          <CardDescription className="text-xs">
            {isTerminal ? "Detalle final." : "Actualiza automáticamente."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Teléfono</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {recipients.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                    <td className="px-3 py-2">
                      <RecipientBadge s={r.status} />
                    </td>
                    <td className="px-3 py-2 max-w-sm truncate text-xs text-red-600">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recipients.length > 200 && (
            <p className="mt-2 text-xs text-muted-foreground">Mostrando los primeros 200.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${color ?? ""}`}>{value}</div>
    </div>
  );
}

function RecipientBadge({ s }: { s: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    s === "sent" || s === "delivered" || s === "read"
      ? "default"
      : s === "failed"
        ? "destructive"
        : s === "replied"
          ? "secondary"
          : "outline";
  return (
    <Badge variant={variant} className="text-[11px]">
      {s}
    </Badge>
  );
}
