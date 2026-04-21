"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { read, utils } from "xlsx";
import { SearchIcon, StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChatwootContact, WhatsAppTemplate } from "@/lib/chatwoot";
import {
  extractVariables,
  getBodyComponent,
  renderPreview,
  type TemplateVariable,
} from "@/lib/templates";
import { createBatch } from "./actions";
import { FilterPanel, mergeFilteredContacts } from "./_filter-panel";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
import { FavoriteButton } from "@/components/favorite-button";

type ExcelRow = Record<string, string>;
type Source = "chatwoot" | "excel";

type PerContactValues = Map<number, Record<number, string>>;

type VarBindingExcel =
  | { kind: "column"; col: string }
  | { kind: "static"; value: string };

export function Wizard({
  templates,
  initialFavorites = [],
}: {
  templates: WhatsAppTemplate[];
  initialFavorites?: string[];
}) {
  const favoriteSet = useMemo(
    () => new Set(initialFavorites),
    [initialFavorites],
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const firstApproved =
    templates.find(
      (t) =>
        t.status === "APPROVED" &&
        favoriteSet.has(`${t.name}|${t.language}`),
    ) ??
    templates.find((t) => t.status === "APPROVED") ??
    templates[0];
  const [selectedKey, setSelectedKey] = useState(
    `${firstApproved.name}|${firstApproved.language}`,
  );
  const [source, setSource] = useState<Source>("chatwoot");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contactCache, setContactCache] = useState<Map<number, ChatwootContact>>(
    new Map(),
  );
  const [perContactValues, setPerContactValues] = useState<PerContactValues>(
    new Map(),
  );

  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [phoneCol, setPhoneCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [xlsBindings, setXlsBindings] = useState<
    Record<number, VarBindingExcel>
  >({});

  const [pending, startTransition] = useTransition();

  const template = useMemo(
    () =>
      templates.find((t) => `${t.name}|${t.language}` === selectedKey) ??
      templates[0],
    [selectedKey, templates],
  );
  const vars = useMemo(() => extractVariables(template), [template]);

  useEffect(() => {
    setPerContactValues(new Map());
    setXlsBindings({});
  }, [vars]);

  const readyCount =
    source === "chatwoot" ? selectedIds.size : rows.length;

  function submit() {
    if (readyCount === 0) {
      toast.error("Selecciona al menos un destinatario");
      return;
    }

    let payloadRows: {
      phone: string;
      name: string | null;
      params: Record<string, string>;
    }[];

    if (source === "chatwoot") {
      const contacts = [...selectedIds]
        .map((id) => contactCache.get(id))
        .filter((c): c is ChatwootContact => Boolean(c?.phone_number));

      const empties: string[] = [];
      for (const c of contacts) {
        for (const v of vars) {
          const val = perContactValues.get(c.id)?.[v.index]?.trim();
          if (!val) empties.push(`${c.name ?? c.phone_number} · ${v.placeholder}`);
        }
      }
      if (empties.length > 0) {
        toast.error(
          `Faltan valores (${empties.length}). Ej: ${empties.slice(0, 2).join(", ")}`,
        );
        return;
      }

      payloadRows = contacts.map((c) => ({
        phone: c.phone_number ?? "",
        name: c.name ?? null,
        params: Object.fromEntries(
          vars.map((v) => [
            String(v.index),
            perContactValues.get(c.id)?.[v.index] ?? "",
          ]),
        ),
      }));
    } else {
      if (!phoneCol) {
        toast.error("Selecciona la columna de teléfono");
        return;
      }
      const missing = vars.filter((v) => !xlsBindings[v.index]);
      if (missing.length > 0) {
        toast.error("Mapea todas las variables a una columna");
        return;
      }
      payloadRows = rows.map((r) => ({
        phone: String(r[phoneCol] ?? "").trim(),
        name: nameCol ? String(r[nameCol] ?? "").trim() : null,
        params: Object.fromEntries(
          vars.map((v) => {
            const b = xlsBindings[v.index];
            const val = b.kind === "column" ? String(r[b.col] ?? "") : b.value;
            return [String(v.index), val];
          }),
        ),
      }));
    }

    startTransition(async () => {
      const res = await createBatch({
        templateName: template.name,
        templateLanguage: template.language,
        rows: payloadRows,
      });
      if (!res.ok) toast.error(res.error);
    });
  }

  const firstValues = useMemo(() => {
    const v: Record<string, string> = {};
    if (source === "chatwoot") {
      const firstId = [...selectedIds][0];
      if (firstId != null) {
        for (const vr of vars) {
          v[String(vr.index)] =
            perContactValues.get(firstId)?.[vr.index] ?? "";
        }
      }
    } else if (rows[0]) {
      for (const vr of vars) {
        const b = xlsBindings[vr.index];
        if (!b) continue;
        v[String(vr.index)] =
          b.kind === "column"
            ? String(rows[0][b.col] ?? "")
            : b.value;
      }
    }
    return v;
  }, [source, selectedIds, perContactValues, vars, rows, xlsBindings]);

  const firstRecipient = useMemo(() => {
    if (source === "chatwoot") {
      const firstId = [...selectedIds][0];
      const c = firstId != null ? contactCache.get(firstId) : undefined;
      return { name: c?.name ?? "", phone: c?.phone_number ?? "" };
    }
    const r = rows[0];
    return {
      name: nameCol && r ? String(r[nameCol] ?? "") : "",
      phone: phoneCol && r ? String(r[phoneCol] ?? "") : "",
    };
  }, [source, selectedIds, contactCache, rows, phoneCol, nameCol]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
      <Stepper step={step} />

      {step === 1 ? (
        <Step1
          templates={templates}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          template={template}
          vars={vars}
          onNext={() => setStep(2)}
          favorites={favoriteSet}
        />
      ) : null}

      {step === 2 ? (
        <Step2
          template={template}
          source={source}
          onSource={setSource}
          vars={vars}
          selectedIds={selectedIds}
          onSelectedIds={setSelectedIds}
          contactCache={contactCache}
          onContactCache={setContactCache}
          perContactValues={perContactValues}
          onPerContactValues={setPerContactValues}
          rows={rows}
          headers={headers}
          phoneCol={phoneCol}
          nameCol={nameCol}
          xlsBindings={xlsBindings}
          onXls={(patch) => {
            if (patch.rows !== undefined) setRows(patch.rows);
            if (patch.headers !== undefined) setHeaders(patch.headers);
            if (patch.phoneCol !== undefined) setPhoneCol(patch.phoneCol);
            if (patch.nameCol !== undefined) setNameCol(patch.nameCol);
            if (patch.xlsBindings !== undefined) setXlsBindings(patch.xlsBindings);
          }}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          readyCount={readyCount}
        />
      ) : null}

      {step === 3 ? (
        <Step3
          template={template}
          vars={vars}
          source={source}
          count={readyCount}
          canSend={template.status === "APPROVED"}
          preview={buildPreview({
            template,
            vars,
            source,
            perContactValues,
            xlsBindings,
            firstContact:
              source === "chatwoot"
                ? [...selectedIds].map((id) => contactCache.get(id))[0]
                : undefined,
            firstRow: rows[0],
            phoneCol,
            nameCol,
          })}
          pending={pending}
          onBack={() => setStep(2)}
          onSubmit={submit}
        />
      ) : null}
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vista previa
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {readyCount > 0
                ? `con datos del 1er destinatario`
                : "variables sin llenar"}
            </span>
          </div>
          <WhatsAppBubble
            template={template}
            values={firstValues}
            highlightVars={readyCount === 0}
            size="md"
          />
          {firstRecipient.phone && (
            <div className="rounded-md border bg-background p-2 text-[11px] text-muted-foreground">
              Se enviará a{" "}
              <span className="font-mono text-foreground">
                {firstRecipient.phone}
              </span>
              {firstRecipient.name ? (
                <>
                  {" "}· <span className="text-foreground">{firstRecipient.name}</span>
                </>
              ) : null}
            </div>
          )}
          <div className="text-[10px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{template.name}</strong>
            {" · "}
            {template.category} · {template.language} · {template.status}
          </div>
        </div>
      </aside>
    </div>
  );
}

function buildPreview({
  template,
  vars,
  source,
  perContactValues,
  xlsBindings,
  firstContact,
  firstRow,
  phoneCol,
  nameCol,
}: {
  template: WhatsAppTemplate;
  vars: TemplateVariable[];
  source: Source;
  perContactValues: PerContactValues;
  xlsBindings: Record<number, VarBindingExcel>;
  firstContact?: ChatwootContact;
  firstRow?: ExcelRow;
  phoneCol: string;
  nameCol: string;
}): { text: string; phone: string; name: string } {
  const values: Record<string, string> = {};
  let phone = "";
  let name = "";
  if (source === "chatwoot" && firstContact) {
    phone = firstContact.phone_number ?? "";
    name = firstContact.name ?? "";
    for (const v of vars) {
      values[String(v.index)] =
        perContactValues.get(firstContact.id)?.[v.index] ?? "";
    }
  } else if (source === "excel" && firstRow) {
    phone = String(firstRow[phoneCol] ?? "");
    name = nameCol ? String(firstRow[nameCol] ?? "") : "";
    for (const v of vars) {
      const b = xlsBindings[v.index];
      values[String(v.index)] =
        b?.kind === "column" ? String(firstRow[b.col] ?? "") : b?.value ?? "";
    }
  }
  return { text: renderPreview(template, values), phone, name };
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Plantilla" },
    { n: 2, label: "Destinatarios" },
    { n: 3, label: "Revisar y enviar" },
  ];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {items.map((it, i) => (
        <li key={it.n} className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
              step === it.n
                ? "border-primary bg-primary text-primary-foreground"
                : step > it.n
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-muted-foreground/30 text-muted-foreground"
            }`}
          >
            {it.n}
          </span>
          <span
            className={step >= it.n ? "font-medium" : "text-muted-foreground"}
          >
            {it.label}
          </span>
          {i < items.length - 1 ? (
            <span className="mx-2 h-px w-8 bg-border" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Step1({
  templates,
  selectedKey,
  onSelect,
  template,
  vars,
  onNext,
  favorites,
}: {
  templates: WhatsAppTemplate[];
  selectedKey: string;
  onSelect: (v: string) => void;
  template: WhatsAppTemplate;
  vars: TemplateVariable[];
  onNext: () => void;
  favorites: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = templates.filter((t) => {
      const key = `${t.name}|${t.language}`;
      if (onlyFavorites && !favorites.has(key)) return false;
      if (!showAll && t.status !== "APPROVED") return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        t.language.toLowerCase().includes(needle)
      );
    });
    return filtered.sort((a, b) => {
      const fa = favorites.has(`${a.name}|${a.language}`) ? 0 : 1;
      const fb = favorites.has(`${b.name}|${b.language}`) ? 0 : 1;
      const sa = a.status === "APPROVED" ? 0 : 1;
      const sb = b.status === "APPROVED" ? 0 : 1;
      return fa - fb || sa - sb || a.name.localeCompare(b.name);
    });
  }, [templates, q, showAll, onlyFavorites, favorites]);

  const favCount = templates.filter((t) =>
    favorites.has(`${t.name}|${t.language}`),
  ).length;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Escoge la plantilla</CardTitle>
        <p className="text-xs text-muted-foreground">
          {templates.filter((t) => t.status === "APPROVED").length} aprobadas ·{" "}
          {favCount} favorita{favCount === 1 ? "" : "s"} ·{" "}
          {templates.length} en total
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar plantilla por nombre…"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            disabled={favCount === 0}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
              onlyFavorites
                ? "border-amber-400 bg-amber-50 text-amber-700"
                : "bg-background hover:bg-accent"
            }`}
            title={
              favCount === 0
                ? "Marca alguna plantilla como favorita primero"
                : onlyFavorites
                  ? "Mostrar todas"
                  : "Solo favoritas"
            }
          >
            <StarIcon
              className="size-3.5"
              fill={onlyFavorites ? "currentColor" : "none"}
            />
            Favoritas
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={showAll}
              onCheckedChange={(v) => setShowAll(Boolean(v))}
            />
            Mostrar pendientes / rechazadas
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            Ninguna plantilla coincide.
          </div>
        ) : (
          <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((t) => (
              <TemplateCard
                key={`${t.name}|${t.language}`}
                template={t}
                active={selectedKey === `${t.name}|${t.language}`}
                favorited={favorites.has(`${t.name}|${t.language}`)}
                onSelect={() => onSelect(`${t.name}|${t.language}`)}
              />
            ))}
          </div>
        )}

        {template.status !== "APPROVED" ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            La plantilla seleccionada está{" "}
            <span className="font-semibold">{template.status}</span> en Meta —
            no la podrás disparar hasta que Meta la apruebe.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button onClick={onNext} disabled={!selectedKey}>
            Siguiente
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateCard({
  template,
  active,
  favorited,
  onSelect,
}: {
  template: WhatsAppTemplate;
  active: boolean;
  favorited: boolean;
  onSelect: () => void;
}) {
  const body = getBodyComponent(template);
  const bodyText = body?.text ?? "";
  const truncated =
    bodyText.length > 140 ? `${bodyText.slice(0, 140)}…` : bodyText;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition ${
        active
          ? "border-primary ring-2 ring-primary/30"
          : "hover:border-primary/40 hover:bg-accent"
      }`}
    >
      <div className="absolute right-1.5 top-1.5 z-10">
        <FavoriteButton
          name={template.name}
          language={template.language}
          favorited={favorited}
          size="sm"
        />
      </div>
      <div className="flex items-start justify-between gap-2 pr-8">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div
            className="truncate font-mono text-xs font-medium"
            title={template.name}
          >
            {template.name}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {template.category} · {template.language}
          </div>
        </div>
        <Badge
          variant={template.status === "APPROVED" ? "secondary" : "outline"}
          className="shrink-0 text-[10px]"
        >
          {template.status}
        </Badge>
      </div>
      <p className="line-clamp-4 text-[11px] leading-relaxed text-muted-foreground">
        {truncated}
      </p>
      {active && (
        <div className="mt-auto text-[10px] font-medium uppercase tracking-wide text-primary">
          ✓ Seleccionada
        </div>
      )}
    </div>
  );
}

function Step2(props: {
  template: WhatsAppTemplate;
  source: Source;
  onSource: (s: Source) => void;
  vars: TemplateVariable[];
  selectedIds: Set<number>;
  onSelectedIds: (s: Set<number>) => void;
  contactCache: Map<number, ChatwootContact>;
  onContactCache: (m: Map<number, ChatwootContact>) => void;
  perContactValues: PerContactValues;
  onPerContactValues: (m: PerContactValues) => void;
  rows: ExcelRow[];
  headers: string[];
  phoneCol: string;
  nameCol: string;
  xlsBindings: Record<number, VarBindingExcel>;
  onXls: (patch: {
    rows?: ExcelRow[];
    headers?: string[];
    phoneCol?: string;
    nameCol?: string;
    xlsBindings?: Record<number, VarBindingExcel>;
  }) => void;
  readyCount: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Destinatarios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={props.source} onValueChange={(v) => props.onSource(v as Source)}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="chatwoot">Contactos de Chatwoot</TabsTrigger>
            <TabsTrigger value="excel">Subir Excel</TabsTrigger>
          </TabsList>

          <TabsContent value="chatwoot" className="space-y-5">
            <FilterPanel
              onApply={(newContacts) => {
                const merged = mergeFilteredContacts(
                  props.contactCache,
                  props.selectedIds,
                  newContacts,
                  "replace",
                );
                props.onContactCache(merged.cache);
                props.onSelectedIds(merged.selected);
              }}
            />
            <ChatwootPicker
              selectedIds={props.selectedIds}
              onSelectedIds={props.onSelectedIds}
              contactCache={props.contactCache}
              onContactCache={props.onContactCache}
            />
            {props.vars.length > 0 && props.selectedIds.size > 0 ? (
              <PerContactEditor
                selectedIds={props.selectedIds}
                contactCache={props.contactCache}
                vars={props.vars}
                values={props.perContactValues}
                onChange={props.onPerContactValues}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="excel" className="space-y-5">
            <ExcelPicker
              template={props.template}
              rows={props.rows}
              headers={props.headers}
              phoneCol={props.phoneCol}
              nameCol={props.nameCol}
              vars={props.vars}
              xlsBindings={props.xlsBindings}
              onXls={props.onXls}
            />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={props.onBack}>
            Atrás
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {props.readyCount} destinatario
              {props.readyCount === 1 ? "" : "s"}
            </span>
            <Button
              onClick={props.onNext}
              disabled={props.readyCount === 0}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatwootPicker({
  selectedIds,
  onSelectedIds,
  contactCache,
  onContactCache,
}: {
  selectedIds: Set<number>;
  onSelectedIds: (s: Set<number>) => void;
  contactCache: Map<number, ChatwootContact>;
  onContactCache: (m: Map<number, ChatwootContact>) => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [contacts, setContacts] = useState<ChatwootContact[]>([]);
  const [total, setTotal] = useState(0);
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(
        `/api/contacts?page=${page}&q=${encodeURIComponent(q)}`,
      )
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const p = (data.payload ?? []) as ChatwootContact[];
          setContacts(p.filter((c) => c.phone_number));
          setTotal(data.meta?.count ?? p.length);
          const next = new Map(contactCache);
          for (const c of p) next.set(c.id, c);
          onContactCache(next);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page]);

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIds(next);
  }

  function toggleAllVisible() {
    const ids = contacts.map((c) => c.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    onSelectedIds(next);
  }

  async function selectAllMatches() {
    setLoadingAll(true);
    const next = new Set(selectedIds);
    const cache = new Map(contactCache);
    try {
      for (let p = 1; p <= pageCount; p++) {
        const res = await fetch(
          `/api/contacts?page=${p}&q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        const list = (data.payload ?? []) as ChatwootContact[];
        for (const c of list) {
          cache.set(c.id, c);
          if (c.phone_number) next.add(c.id);
        }
      }
      onContactCache(cache);
      onSelectedIds(next);
    } finally {
      setLoadingAll(false);
    }
  }

  function clearAll() {
    onSelectedIds(new Set());
  }

  const allVisibleSelected =
    contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono o email..."
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {total} contacto{total === 1 ? "" : "s"} · {selectedIds.size}{" "}
          seleccionado{selectedIds.size === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectAllMatches}
          disabled={loadingAll || total === 0}
          className="rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          {loadingAll
            ? "Seleccionando..."
            : `Seleccionar todos (${total})`}
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={selectedIds.size === 0}
          className="rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Limpiar selección
        </button>
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleAllVisible}
            />
            <span>Seleccionar esta página</span>
          </label>
          {loading ? (
            <span className="text-muted-foreground">Cargando...</span>
          ) : null}
        </div>
        <ScrollArea className="h-80">
          {contacts.length === 0 && !loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ningún contacto con teléfono{" "}
              {q ? "coincide con la búsqueda" : ""}
            </div>
          ) : (
            <ul className="divide-y">
              {contacts.map((c) => {
                const checked = selectedIds.has(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(c.id)}
                      />
                      <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(c.name ?? c.phone_number ?? "?")
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {c.name || "(sin nombre)"}
                        </div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {c.phone_number}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2 text-xs">
            <span className="text-muted-foreground">
              Página {page} de {pageCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border px-2.5 py-1 hover:bg-accent disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="rounded-md border px-2.5 py-1 hover:bg-accent disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PerContactEditor({
  selectedIds,
  contactCache,
  vars,
  values,
  onChange,
}: {
  selectedIds: Set<number>;
  contactCache: Map<number, ChatwootContact>;
  vars: TemplateVariable[];
  values: PerContactValues;
  onChange: (m: PerContactValues) => void;
}) {
  const [bulk, setBulk] = useState<Record<number, string>>({});
  const contacts = [...selectedIds]
    .map((id) => contactCache.get(id))
    .filter((c): c is ChatwootContact => Boolean(c));

  function setCell(contactId: number, varIndex: number, val: string) {
    const next = new Map(values);
    const row = { ...(next.get(contactId) ?? {}), [varIndex]: val };
    next.set(contactId, row);
    onChange(next);
  }

  function applyToAll(varIndex: number, val: string, source?: "name" | "phone") {
    const next = new Map(values);
    for (const c of contacts) {
      const resolved =
        source === "name"
          ? c.name ?? ""
          : source === "phone"
            ? c.phone_number ?? ""
            : val;
      const row = { ...(next.get(c.id) ?? {}), [varIndex]: resolved };
      next.set(c.id, row);
    }
    onChange(next);
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">
            Valores por destinatario ({contacts.length})
          </h4>
          <p className="text-xs text-muted-foreground">
            Edita el valor de cada variable para cada paciente. Usa los
            accesos rápidos en el encabezado para rellenar toda la columna.
          </p>
        </div>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-md border bg-background">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-muted/70 backdrop-blur text-xs">
            <tr>
              <th className="sticky left-0 z-30 min-w-56 border-b border-r bg-muted/80 px-3 py-2 text-left font-medium">
                Destinatario
              </th>
              {vars.map((v) => (
                <th
                  key={v.index}
                  className="min-w-[220px] border-b border-l px-3 py-2 text-left align-top font-medium"
                >
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-accent px-1.5 py-0.5 text-[11px]">
                      {v.placeholder}
                    </code>
                    {v.example ? (
                      <span
                        className="truncate text-[11px] text-muted-foreground"
                        title={v.example}
                      >
                        ej. {v.example.slice(0, 24)}
                        {v.example.length > 24 ? "…" : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Input
                      className="h-7 flex-1 text-xs"
                      placeholder="Aplicar a todos..."
                      value={bulk[v.index] ?? ""}
                      onChange={(e) =>
                        setBulk({ ...bulk, [v.index]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyToAll(v.index, bulk[v.index] ?? "");
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="h-7 shrink-0 rounded-md bg-primary/10 px-2 text-[10px] font-medium text-primary hover:bg-primary/20"
                      onClick={() =>
                        applyToAll(v.index, bulk[v.index] ?? "")
                      }
                      title="Aplicar a todas las filas"
                    >
                      Aplicar
                    </button>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      className="h-6 rounded-md border px-1.5 text-[10px] hover:bg-accent"
                      onClick={() => applyToAll(v.index, "", "name")}
                      title="Usar nombre del contacto en cada fila"
                    >
                      Nombre
                    </button>
                    <button
                      type="button"
                      className="h-6 rounded-md border px-1.5 text-[10px] hover:bg-accent"
                      onClick={() => applyToAll(v.index, "", "phone")}
                      title="Usar teléfono en cada fila"
                    >
                      Tel
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map((c, i) => (
              <tr key={c.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                <td
                  className={`sticky left-0 z-10 min-w-56 border-b border-r px-3 py-2.5 align-top ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/10"
                  }`}
                >
                  <div className="truncate text-sm font-medium">
                    {c.name || "(sin nombre)"}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {c.phone_number}
                  </div>
                </td>
                {vars.map((v) => (
                  <td
                    key={v.index}
                    className="min-w-[220px] border-b border-l px-2 py-1.5"
                  >
                    <Input
                      className="h-8 text-xs"
                      value={values.get(c.id)?.[v.index] ?? ""}
                      placeholder={v.example || v.placeholder}
                      onChange={(e) => setCell(c.id, v.index, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExcelPicker({
  template,
  rows,
  headers,
  phoneCol,
  nameCol,
  vars,
  xlsBindings,
  onXls,
}: {
  template: WhatsAppTemplate;
  rows: ExcelRow[];
  headers: string[];
  phoneCol: string;
  nameCol: string;
  vars: TemplateVariable[];
  xlsBindings: Record<number, VarBindingExcel>;
  onXls: (patch: {
    rows?: ExcelRow[];
    headers?: string[];
    phoneCol?: string;
    nameCol?: string;
    xlsBindings?: Record<number, VarBindingExcel>;
  }) => void;
}) {
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = utils.sheet_to_json<ExcelRow>(sheet, {
      defval: "",
      raw: false,
    });
    if (json.length === 0) {
      toast.error("El archivo está vacío");
      return;
    }
    const cols = Object.keys(json[0] as ExcelRow);
    const guessPhone =
      cols.find((c) => /tel|phone|cel|whats/i.test(c)) ?? cols[0];
    const guessName = cols.find((c) => /nombre|name/i.test(c)) ?? "";
    const bindings: Record<number, VarBindingExcel> = {};
    for (const v of vars) {
      const guess = cols.find((c) =>
        c.toLowerCase().includes(`var${v.index}`),
      );
      if (guess) bindings[v.index] = { kind: "column", col: guess };
    }
    onXls({
      rows: json,
      headers: cols,
      phoneCol: guessPhone,
      nameCol: guessName,
      xlsBindings: bindings,
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="file">Archivo .xlsx o .csv</Label>
        <Input
          id="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
        />
        <p className="text-xs text-muted-foreground">
          La primera fila debe ser el encabezado con los nombres de columna.
        </p>
      </div>

      {headers.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Columna de teléfono</Label>
              <Select
                value={phoneCol}
                onValueChange={(v) => onXls({ phoneCol: v ?? "" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Columna de nombre (opcional)</Label>
              <Select
                value={nameCol || "__none__"}
                onValueChange={(v) =>
                  onXls({ nameCol: v === "__none__" || v == null ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Ninguna —</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {vars.length > 0 ? (
            <div className="space-y-3 rounded-md border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Mapeo de variables</h4>
                <span className="text-[10px] text-muted-foreground">
                  Muestra el valor real de la 1ª fila en gris
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {vars.map((v) => {
                  const b = xlsBindings[v.index];
                  const firstRow = rows[0];
                  const sampleValue =
                    b?.kind === "column" && firstRow
                      ? String(firstRow[b.col] ?? "").trim()
                      : b?.kind === "static"
                        ? b.value.trim()
                        : "";
                  return (
                    <div
                      key={v.index}
                      className={`space-y-2 rounded-md border bg-background p-3 ${
                        b ? "border-primary/30" : "border-dashed"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-900">
                          {v.placeholder}
                        </code>
                        {v.example && (
                          <span
                            className="truncate text-[10px] text-muted-foreground"
                            title={v.example}
                          >
                            ej: {v.example}
                          </span>
                        )}
                      </div>
                      <Select
                        value={
                          b?.kind === "column"
                            ? `col:${b.col}`
                            : b?.kind === "static"
                              ? "static"
                              : ""
                        }
                        onValueChange={(val) => {
                          const v0 = val ?? "";
                          const next: VarBindingExcel = v0.startsWith("col:")
                            ? { kind: "column", col: v0.slice(4) }
                            : { kind: "static", value: "" };
                          onXls({
                            xlsBindings: { ...xlsBindings, [v.index]: next },
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Elige cómo llenar…" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map((h) => {
                            const preview = firstRow
                              ? String(firstRow[h] ?? "").trim()
                              : "";
                            return (
                              <SelectItem key={h} value={`col:${h}`}>
                                <span className="flex flex-col items-start">
                                  <span className="font-medium">
                                    Columna: {h}
                                  </span>
                                  {preview && (
                                    <span className="truncate text-[10px] text-muted-foreground">
                                      → {preview.slice(0, 40)}
                                      {preview.length > 40 ? "…" : ""}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                          <SelectItem value="static">
                            Texto fijo (igual para todos)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {b?.kind === "static" ? (
                        <Input
                          value={b.value}
                          placeholder="Valor fijo…"
                          onChange={(e) =>
                            onXls({
                              xlsBindings: {
                                ...xlsBindings,
                                [v.index]: {
                                  kind: "static",
                                  value: e.target.value,
                                },
                              },
                            })
                          }
                        />
                      ) : null}
                      {b?.kind === "column" && (
                        <div className="rounded bg-muted/60 px-2 py-1 text-[11px]">
                          <span className="text-muted-foreground">
                            1ª fila →{" "}
                          </span>
                          {sampleValue ? (
                            <span className="font-medium text-foreground">
                              {sampleValue.slice(0, 60)}
                              {sampleValue.length > 60 ? "…" : ""}
                            </span>
                          ) : (
                            <span className="italic text-destructive">
                              (vacío en la primera fila)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="text-xs text-muted-foreground">
            {rows.length} filas cargadas · vista previa de las 3 primeras
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 3).map((r, i) => (
                  <TableRow key={i}>
                    {headers.map((h) => (
                      <TableCell key={h} className="font-mono text-xs">
                        {r[h]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Step3({
  template,
  vars,
  source,
  count,
  canSend,
  preview,
  pending,
  onBack,
  onSubmit,
}: {
  template: WhatsAppTemplate;
  vars: TemplateVariable[];
  source: Source;
  count: number;
  canSend: boolean;
  preview: { text: string; phone: string; name: string };
  pending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revisar y enviar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Plantilla" value={template.name} />
          <Stat label="Idioma" value={template.language.toUpperCase()} />
          <Stat label="Fuente" value={source === "chatwoot" ? "Chatwoot" : "Excel"} />
          <Stat label="Destinatarios" value={String(count)} />
        </div>
        <div className="space-y-2">
          <Label>Previsualización (primer destinatario)</Label>
          <div className="mx-auto max-w-sm rounded-xl bg-[#dcf8c6] p-4 text-sm shadow-sm">
            <pre className="whitespace-pre-wrap font-sans text-foreground">
              {preview.text}
            </pre>
          </div>
          <div className="text-xs text-muted-foreground">
            {preview.name ? (
              <>
                <span className="font-medium">{preview.name}</span> ·{" "}
              </>
            ) : null}
            <span className="font-mono">{preview.phone}</span>
          </div>
        </div>
        {vars.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Esta plantilla no tiene variables — se enviará el texto tal cual.
          </p>
        ) : null}
        {!canSend ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            Plantilla en estado{" "}
            <span className="font-semibold">{template.status}</span> — Meta aún
            no la ha aprobado. El envío se habilitará automáticamente cuando
            pase a APPROVED (sin redeploy).
          </div>
        ) : null}
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack} disabled={pending}>
            Atrás
          </Button>
          <Button
            onClick={onSubmit}
            disabled={pending || count === 0 || !canSend}
          >
            {pending
              ? "Enviando..."
              : !canSend
                ? "Plantilla no aprobada"
                : `Enviar a ${count} contactos`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
