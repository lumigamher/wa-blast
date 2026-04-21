"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FilterIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatwootContact, ChatwootLabel } from "@/lib/chatwoot";

type StatusKey = "open" | "pending" | "resolved" | "snoozed";
const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: "open", label: "Abierta" },
  { value: "pending", label: "Pendiente" },
  { value: "resolved", label: "Resuelta" },
  { value: "snoozed", label: "Pospuesta" },
];

type DateMode =
  | "any"
  | "7"
  | "30"
  | "90"
  | "specific"
  | "range";

const DATE_OPTIONS: { value: DateMode; label: string }[] = [
  { value: "any", label: "Cualquier fecha" },
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "specific", label: "Un día específico" },
  { value: "range", label: "Rango personalizado" },
];

function startOfDayEpoch(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

function endOfDayEpoch(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

type FilterResult = {
  contacts: ChatwootContact[];
  total: number;
  capped: boolean;
};

export function FilterPanel({
  onApply,
}: {
  onApply: (contacts: ChatwootContact[]) => void;
}) {
  const [labels, setLabels] = useState<ChatwootLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(true);

  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelsMode, setLabelsMode] = useState<"and" | "or">("or");

  const [statuses, setStatuses] = useState<StatusKey[]>(["open", "pending"]);
  const [dateMode, setDateMode] = useState<DateMode>("any");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [lastResult, setLastResult] = useState<FilterResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/chatwoot/labels")
      .then((r) => r.json())
      .then((d) => setLabels(d.labels ?? []))
      .catch(() => toast.error("No se pudieron cargar las etiquetas"))
      .finally(() => setLabelsLoading(false));
  }, []);

  const groupedLabels = useMemo(() => {
    const groups = new Map<string, ChatwootLabel[]>();
    for (const l of labels) {
      const prefix = l.title.includes("-") ? l.title.split("-")[0] : "otros";
      const arr = groups.get(prefix) ?? [];
      arr.push(l);
      groups.set(prefix, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [labels]);

  function toggleLabel(title: string) {
    setSelectedLabels((s) =>
      s.includes(title) ? s.filter((x) => x !== title) : [...s, title],
    );
  }

  function toggleStatus(status: StatusKey) {
    setStatuses((s) =>
      s.includes(status) ? s.filter((x) => x !== status) : [...s, status],
    );
  }

  function reset() {
    setSelectedLabels([]);
    setLabelsMode("or");
    setStatuses(["open", "pending"]);
    setDateMode("any");
    setDateFrom("");
    setDateTo("");
    setLastResult(null);
  }

  function apply() {
    if (statuses.length === 0) {
      toast.error("Selecciona al menos un estado de conversación");
      return;
    }

    let sinceEpoch: number | undefined;
    let untilEpoch: number | undefined;

    if (dateMode === "7" || dateMode === "30" || dateMode === "90") {
      sinceEpoch = Math.floor(Date.now() / 1000) - Number(dateMode) * 86400;
    } else if (dateMode === "specific") {
      if (!dateFrom) {
        toast.error("Selecciona la fecha");
        return;
      }
      sinceEpoch = startOfDayEpoch(dateFrom) ?? undefined;
      untilEpoch = endOfDayEpoch(dateFrom) ?? undefined;
    } else if (dateMode === "range") {
      if (!dateFrom || !dateTo) {
        toast.error("Selecciona ambas fechas del rango");
        return;
      }
      sinceEpoch = startOfDayEpoch(dateFrom) ?? undefined;
      untilEpoch = endOfDayEpoch(dateTo) ?? undefined;
      if (
        sinceEpoch !== undefined &&
        untilEpoch !== undefined &&
        sinceEpoch > untilEpoch
      ) {
        toast.error("La fecha inicial debe ser anterior a la final");
        return;
      }
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/conversations/filter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labels: selectedLabels,
            labelsMode,
            statuses,
            sinceEpoch,
            untilEpoch,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(
            `Error al filtrar: ${err.error ?? res.statusText}`,
          );
          return;
        }
        const data = (await res.json()) as FilterResult;
        setLastResult(data);
        onApply(data.contacts);
        if (data.contacts.length === 0) {
          toast.info("Ningún contacto coincide con los filtros");
        } else {
          toast.success(
            `${data.contacts.length} contacto${data.contacts.length === 1 ? "" : "s"} aplicado${data.contacts.length === 1 ? "" : "s"}${data.capped ? ` (de ${data.total}, limitado a 500)` : ""}`,
          );
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FilterIcon className="size-4" />
          Filtrar contactos por conversación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Etiquetas
              {selectedLabels.length > 0 ? (
                <span className="ml-2 font-normal text-foreground">
                  · {selectedLabels.length} seleccionada
                  {selectedLabels.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </Label>
            {selectedLabels.length > 1 ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setLabelsMode("and")}
                  className={`rounded-l-md border px-2 py-0.5 text-[10px] font-medium ${
                    labelsMode === "and"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background"
                  }`}
                  title="Conversaciones que tienen TODAS las etiquetas"
                >
                  Y (todas)
                </button>
                <button
                  type="button"
                  onClick={() => setLabelsMode("or")}
                  className={`-ml-px rounded-r-md border px-2 py-0.5 text-[10px] font-medium ${
                    labelsMode === "or"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background"
                  }`}
                  title="Conversaciones que tienen CUALQUIERA de las etiquetas"
                >
                  O (cualquiera)
                </button>
              </div>
            ) : null}
          </div>
          {labelsLoading ? (
            <div className="text-xs text-muted-foreground">
              Cargando etiquetas…
            </div>
          ) : labels.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No hay etiquetas en Chatwoot.
            </div>
          ) : (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              {groupedLabels.map(([prefix, items]) => (
                <div key={prefix} className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {prefix}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((l) => {
                      const active = selectedLabels.includes(l.title);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => toggleLabel(l.title)}
                          className={`group flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-accent"
                          }`}
                          style={
                            !active
                              ? { borderColor: l.color + "66" }
                              : undefined
                          }
                        >
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ backgroundColor: l.color }}
                          />
                          {l.title}
                          {active ? <XIcon className="size-3" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Última actividad
            </Label>
            <Select
              value={dateMode}
              onValueChange={(v) => v && setDateMode(v as DateMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {dateMode === "specific" && (
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            )}
            {dateMode === "range" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">a</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estado de conversación
            </Label>
            <div className="mt-1 flex flex-wrap gap-3 rounded-md border bg-background px-3 py-2">
              {STATUS_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className="flex cursor-pointer items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={statuses.includes(s.value)}
                    onCheckedChange={() => toggleStatus(s.value)}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {lastResult
              ? `Último filtro: ${lastResult.contacts.length} contacto${
                  lastResult.contacts.length === 1 ? "" : "s"
                } (de ${lastResult.total} conversaciones)${
                  lastResult.capped ? " — limitado a 500" : ""
                }`
              : "Aplica filtros para poblar la lista de destinatarios."}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={pending}
            >
              Limpiar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={pending}
            >
              {pending ? "Filtrando…" : "Aplicar filtros"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function mergeFilteredContacts(
  existingCache: Map<number, ChatwootContact>,
  existingSelected: Set<number>,
  newContacts: ChatwootContact[],
  mode: "replace" | "add",
): { cache: Map<number, ChatwootContact>; selected: Set<number> } {
  const cache = new Map(existingCache);
  for (const c of newContacts) cache.set(c.id, c);
  const selected =
    mode === "replace" ? new Set<number>() : new Set(existingSelected);
  for (const c of newContacts) {
    if (c.phone_number) selected.add(c.id);
  }
  return { cache, selected };
}
