"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  analyzeDuplicatesAction,
  resolveOneConversationAction,
  type AnalyzeResult,
} from "./cleanup-actions";

type ResolveProgress = {
  total: number;
  done: number;
  resolved: number;
  failed: number;
  currentPhone?: string;
  startedAt: number;
};

export function CleanupDuplicatesCard() {
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [analyzing, startAnalyze] = useTransition();
  const [progress, setProgress] = useState<ResolveProgress | null>(null);
  const resolving = progress !== null && progress.done < progress.total;
  const router = useRouter();

  function analyze() {
    startAnalyze(async () => {
      const res = await analyzeDuplicatesAction();
      setAnalysis(res);
      if (res.ok) {
        if (res.totalToResolve === 0) {
          toast.success("Sin conversaciones duplicadas");
        } else {
          toast.info(
            `${res.totalToResolve} conversaciones antiguas en ${res.totalContactsAffected} contacto${
              res.totalContactsAffected === 1 ? "" : "s"
            }`,
          );
        }
      } else {
        toast.error(res.error);
      }
    });
  }

  async function resolve() {
    if (!analysis?.ok || analysis.totalToResolve === 0) return;
    const ok = confirm(
      `Se van a resolver ${analysis.totalToResolve} conversaciones antiguas de ${analysis.totalContactsAffected} contactos. ¿Continuar?`,
    );
    if (!ok) return;

    const jobs: { convId: number; phone: string | null }[] = [];
    for (const g of analysis.groups) {
      for (const convId of g.toResolveIds) {
        jobs.push({ convId, phone: g.contactPhone });
      }
    }

    setProgress({
      total: jobs.length,
      done: 0,
      resolved: 0,
      failed: 0,
      startedAt: Date.now(),
    });

    let resolved = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      setProgress({
        total: jobs.length,
        done: i,
        resolved,
        failed,
        currentPhone: job.phone ?? undefined,
        startedAt: progress?.startedAt ?? Date.now(),
      });
      const res = await resolveOneConversationAction(job.convId);
      if (res.ok) resolved++;
      else {
        failed++;
        if (errors.length < 5) errors.push(`#${job.convId}: ${res.error}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    setProgress({
      total: jobs.length,
      done: jobs.length,
      resolved,
      failed,
      startedAt: 0,
    });

    if (failed > 0) {
      toast.warning(
        `${resolved} resueltas, ${failed} fallaron${
          errors.length > 0 ? ` · ${errors[0]}` : ""
        }`,
        { duration: 10000 },
      );
    } else {
      toast.success(`${resolved} conversaciones resueltas ✓`);
    }

    setTimeout(() => {
      setAnalysis(null);
      setExpanded(false);
      setProgress(null);
      router.refresh();
    }, 2000);
  }

  const hasResults = analysis?.ok && analysis.totalToResolve > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="size-4" />
            Limpieza de conversaciones duplicadas
          </CardTitle>
          <CardDescription>
            Deja solo la conversación más reciente de cada contacto y resuelve
            las anteriores. No borra nada; quedan archivadas.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={analyze}
          disabled={analyzing || resolving}
        >
          {analyzing ? "Analizando…" : "Analizar"}
        </Button>
      </CardHeader>
      {analysis?.ok && (
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Conversaciones escaneadas"
              value={analysis.scannedConversations}
            />
            <Metric
              label="Contactos con duplicados"
              value={analysis.totalContactsAffected}
            />
            <Metric
              label="A resolver"
              value={analysis.totalToResolve}
              accent={analysis.totalToResolve > 0}
            />
          </div>
          {hasResults && (
            <>
              {progress && (
                <ProgressPanel progress={progress} />
              )}
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {expanded ? (
                    <>
                      <ChevronUpIcon className="size-3" /> Ocultar detalle
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon className="size-3" /> Ver detalle (
                      {Math.min(analysis.groups.length, 20)} contactos)
                    </>
                  )}
                </button>
                <Button
                  type="button"
                  size="sm"
                  onClick={resolve}
                  disabled={resolving}
                >
                  {resolving
                    ? `Resolviendo… ${progress?.done ?? 0}/${progress?.total ?? 0}`
                    : `Resolver ${analysis.totalToResolve} conversaciones`}
                </Button>
              </div>
              {expanded && (
                <div className="max-h-80 overflow-y-auto rounded-md border bg-muted/20">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="py-2 px-3 text-left font-medium">
                          Contacto
                        </th>
                        <th className="py-2 px-3 text-left font-medium">
                          Teléfono
                        </th>
                        <th className="py-2 px-3 text-right font-medium">
                          Se mantiene
                        </th>
                        <th className="py-2 px-3 text-right font-medium">
                          Se resuelven
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.groups.slice(0, 20).map((g) => (
                        <tr key={g.contactId} className="border-b last:border-0">
                          <td className="py-1.5 px-3 text-foreground">
                            {g.contactName ?? `#${g.contactId}`}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-muted-foreground">
                            {g.contactPhone ?? "—"}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono">
                            <a
                              href={`https://funes.luladev.com/app/accounts/1/conversations/${g.keepConvId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              #{g.keepConvId}
                            </a>
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <Badge variant="outline" className="text-[10px]">
                              {g.toResolveIds.length}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {analysis.groups.length > 20 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-2 px-3 text-center text-muted-foreground"
                          >
                            + {analysis.groups.length - 20} contactos más…
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {analysis.totalToResolve === 0 && (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
              Sin duplicados. Cada contacto tiene como máximo una conversación
              activa.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ProgressPanel({ progress }: { progress: ResolveProgress }) {
  const pct =
    progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  const elapsed = (Date.now() - progress.startedAt) / 1000;
  const rate = progress.done > 0 ? progress.done / elapsed : 0;
  const remaining =
    rate > 0 ? (progress.total - progress.done) / rate : null;
  const etaText =
    remaining == null
      ? "—"
      : remaining < 60
        ? `${Math.round(remaining)}s`
        : `${Math.round(remaining / 60)} min`;

  const done = progress.done >= progress.total;

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          {done
            ? `Terminado: ${progress.resolved} resueltas${progress.failed > 0 ? `, ${progress.failed} fallidas` : ""}`
            : `Resolviendo conversaciones…${progress.currentPhone ? ` (${progress.currentPhone})` : ""}`}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {progress.done} / {progress.total}
          {!done && ` · ~${etaText} restantes`}
        </span>
      </div>
      <Progress value={pct} />
      {(progress.resolved > 0 || progress.failed > 0) && (
        <div className="flex gap-3 text-[11px] text-muted-foreground tabular-nums">
          <span className="text-emerald-600">✓ {progress.resolved}</span>
          {progress.failed > 0 && (
            <span className="text-destructive">✗ {progress.failed}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums ${accent ? "text-amber-600" : "text-foreground"}`}
      >
        {value.toLocaleString("es-CO")}
      </div>
    </div>
  );
}
