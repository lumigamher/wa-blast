"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, PlugIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Result =
  | { ok: true; phone: string; name?: string; quality?: string; tier?: string }
  | { ok: false; error: string };

export function TestConnectionButton() {
  const [isPending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function run() {
    setResult(null);
    start(async () => {
      const r = await fetch("/api/meta/test-connection", { method: "POST" });
      const json = (await r.json()) as Result;
      setResult(json);
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button onClick={run} disabled={isPending} variant="outline" size="sm">
        <PlugIcon className="size-4" />
        {isPending ? "Verificando…" : "Probar conexión"}
      </Button>
      {result?.ok && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
          <CheckCircle2Icon className="size-4" />
          <span>
            Conectado · <b>{result.phone}</b>
            {result.name ? ` (${result.name})` : ""}
          </span>
          {result.quality && (
            <Badge variant="outline" className="text-[10px]">
              {result.quality}
            </Badge>
          )}
          {result.tier && (
            <Badge variant="outline" className="text-[10px]">
              {result.tier}
            </Badge>
          )}
        </div>
      )}
      {result && !result.ok && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          <XCircleIcon className="size-4" />
          <span className="max-w-sm truncate">{result.error}</span>
        </div>
      )}
    </div>
  );
}
