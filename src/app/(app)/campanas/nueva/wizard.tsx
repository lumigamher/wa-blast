"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { read, utils } from "xlsx";
import { CalendarClockIcon, ChevronRightIcon, SendIcon, UploadIcon, UsersIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
import type { WhatsAppTemplate } from "@/lib/meta/types";
import { extractVariables } from "@/lib/templates";
import { isCarousel, parseCarousel } from "@/lib/meta/carousel";
import { CarouselMapping, type CarouselMappingValue } from "./carousel-mapping";
import { CarouselPreview } from "@/components/carousel-preview";
import { buildCarouselPlan } from "@/lib/campaigns/build-carousel-plan";
import { createCampaignAction } from "./actions";

type Step = 1 | 2 | 3;
type Source = "tags" | "adhoc";

type TagRow = { id: string; name: string; color: string; count: number };

type AdhocRow = { phone: string; name: string; params: Record<string, string> };

export function Wizard({
  templates,
  tags,
  prefillMedia = {},
}: {
  templates: WhatsAppTemplate[];
  tags: TagRow[];
  prefillMedia?: Record<string, Record<number, string>>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [isPending, startTransition] = useTransition();

  const approved = useMemo(() => templates.filter((t) => t.status === "APPROVED"), [templates]);
  const [selectedKey, setSelectedKey] = useState<string>(
    approved[0] ? `${approved[0].name}|${approved[0].language}` : "",
  );
  const selected = useMemo(
    () => approved.find((t) => `${t.name}|${t.language}` === selectedKey),
    [approved, selectedKey],
  );
  const vars = useMemo(() => (selected ? extractVariables(selected) : []), [selected]);
  const carousel = useMemo(
    () => (selected && isCarousel(selected) ? parseCarousel(selected) : null),
    [selected],
  );

  const [source, setSource] = useState<Source>("tags");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [adhocRows, setAdhocRows] = useState<AdhocRow[]>([]);

  const [name, setName] = useState("");
  const [bulkParams, setBulkParams] = useState<Record<string, string>>({});
  const [carouselMapping, setCarouselMapping] = useState<CarouselMappingValue>({
    vars: {},
    cardMedia: {},
  });
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const tagsCount = useMemo(() => {
    return tags.filter((t) => selectedTagIds.has(t.id)).reduce((s, t) => s + t.count, 0);
  }, [tags, selectedTagIds]);
  const total = source === "tags" ? tagsCount : adhocRows.length;

  function togglTag(id: string) {
    const next = new Set(selectedTagIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTagIds(next);
  }

  async function handleFile(f: File) {
    const buf = await f.arrayBuffer();
    const wb = read(buf, { type: "array" });
    const rows = utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], {
      raw: false,
      defval: "",
    });
    const parsed: AdhocRow[] = rows
      .map((r) => {
        const phone = String(r.phone ?? r.telefono ?? r.teléfono ?? "").trim();
        if (!phone) return null;
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          if (/^\d+$/.test(k) && v) params[k] = String(v);
        }
        return { phone, name: String(r.name ?? r.nombre ?? "").trim(), params };
      })
      .filter(Boolean) as AdhocRow[];
    setAdhocRows(parsed);
    toast.success(`${parsed.length} filas cargadas`);
  }

  function launch(payload: Record<string, unknown> & { force?: boolean }) {
    startTransition(async () => {
      const res = await createCampaignAction(payload);
      if (!res.ok) {
        if (res.duplicate) {
          // Posible doble envío: pedir confirmación explícita antes de repetir.
          toast.warning(res.error, {
            duration: 15000,
            action: { label: "Enviar igual", onClick: () => launch({ ...payload, force: true }) },
          });
          return;
        }
        toast.error(res.error);
        return;
      }
      toast.success(res.scheduled ? "Campaña programada" : "Campaña disparada");
      router.push(`/campanas/${res.campaignId}`);
    });
  }

  function submit() {
    if (!selected) return toast.error("Selecciona una plantilla");
    if (!name.trim()) return toast.error("Ponle un nombre a la campaña");

    // Carousel flow
    if (carousel) {
      const prefill = prefillMedia[`${selected.name}|${selected.language}`] ?? {};
      const cardMedia: Record<number, string> = {};
      carousel.cards.forEach((_, i) => {
        cardMedia[i] = carouselMapping.cardMedia[i] ?? prefill[i] ?? "";
      });

      // Validate media
      for (const [idx, url] of Object.entries(cardMedia)) {
        if (!url.trim()) {
          return toast.error(`Tarjeta ${Number(idx) + 1}: añade una URL de media`);
        }
      }

      const { plan } = buildCarouselPlan({
        parsed: carousel,
        vars: carouselMapping.vars,
        cardMedia,
      });

      const payload = {
        name: name.trim(),
        templateName: selected.name,
        templateLanguage: selected.language,
        source,
        tagIds: source === "tags" ? [...selectedTagIds] : undefined,
        adhocRows:
          source === "adhoc"
            ? adhocRows.map((r) => ({
                phone: r.phone,
                name: r.name,
                params: r.params,
              }))
            : undefined,
        templateType: "carousel" as const,
        componentPlanJson: JSON.stringify(plan),
        varMapping: carouselMapping.vars,
        scheduledAt: scheduleMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      };

      launch(payload);
      return;
    }

    // Standard flow
    const paramsByContact: Record<string, Record<string, string>> | undefined =
      source === "tags" && Object.keys(bulkParams).length > 0 ? undefined : undefined;

    const payload = {
      name: name.trim(),
      templateName: selected.name,
      templateLanguage: selected.language,
      source,
      tagIds: source === "tags" ? [...selectedTagIds] : undefined,
      adhocRows:
        source === "adhoc"
          ? adhocRows.map((r) => ({
              phone: r.phone,
              name: r.name,
              params: { ...bulkParams, ...r.params },
            }))
          : undefined,
      paramsByContact,
      scheduledAt: scheduleMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };

    launch(payload);
  }

  if (approved.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-sm text-muted-foreground">No tienes plantillas aprobadas en Meta.</div>
          <a href="/plantillas/nueva" className={buttonVariants({ size: "sm" })}>
            Crear plantilla
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <StepsHeader step={step} total={total} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1 · Elige plantilla</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {approved.map((t) => {
                  const key = `${t.name}|${t.language}`;
                  const isSelected = key === selectedKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "hover:bg-muted"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.category} · {t.language}
                        </div>
                      </div>
                      <Badge variant="default" className="shrink-0">
                        {t.status}
                      </Badge>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2 · Elige destinatarios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={source === "tags" ? "default" : "outline"}
                    onClick={() => setSource("tags")}
                  >
                    <UsersIcon className="size-4" /> Por tags
                  </Button>
                  <Button
                    size="sm"
                    variant={source === "adhoc" ? "default" : "outline"}
                    onClick={() => setSource("adhoc")}
                  >
                    <UploadIcon className="size-4" /> Subir CSV / Excel
                  </Button>
                </div>

                {source === "tags" && (
                  <div className="space-y-2">
                    {tags.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No tienes tags todavía.{" "}
                        <a href="/contactos/tags" className="underline">
                          Crear tag
                        </a>{" "}
                        o{" "}
                        <a href="/contactos/import" className="underline">
                          importa contactos
                        </a>
                        .
                      </div>
                    ) : (
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {tags.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
                          >
                            <Checkbox
                              id={`tag-${t.id}`}
                              checked={selectedTagIds.has(t.id)}
                              onCheckedChange={() => togglTag(t.id)}
                            />
                            <span
                              className="inline-block size-3 shrink-0 rounded-full"
                              style={{ backgroundColor: t.color }}
                            />
                            <Label htmlFor={`tag-${t.id}`} className="flex-1 cursor-pointer text-sm font-medium">
                              {t.name}
                            </Label>
                            <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {source === "adhoc" && (
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                    <p className="text-xs text-muted-foreground">
                      Columna <code className="rounded bg-muted px-1">phone</code> obligatoria. Opcional{" "}
                      <code className="rounded bg-muted px-1">name</code>. Para variables usa columnas{" "}
                      <code className="rounded bg-muted px-1">1</code>, <code className="rounded bg-muted px-1">2</code>,
                      etc.
                    </p>
                    {adhocRows.length > 0 && (
                      <div className="rounded-md border p-3 text-sm">
                        <b>{adhocRows.length}</b> filas listas para enviar.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">3 · Revisa y envía</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre de la campaña</Label>
                  <Input
                    id="name"
                    placeholder="Ej. Promo Abril 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {carousel ? (
                  <div className="space-y-2">
                    <Label>Mapeo de variables y media</Label>
                    <CarouselMapping
                      parsed={carousel}
                      prefillMedia={prefillMedia[`${selected!.name}|${selected!.language}`] ?? {}}
                      value={carouselMapping}
                      onChange={setCarouselMapping}
                    />
                  </div>
                ) : (
                  vars.length > 0 && (
                    <div className="space-y-2">
                      <Label>Variables</Label>
                      <p className="text-xs text-muted-foreground">
                        Valor por defecto para todos (los CSV pueden traer sus propios valores en columnas
                        numeradas).
                      </p>
                      {vars.map((v) => (
                        <div key={v.index} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <code className="w-14 shrink-0 font-mono text-xs">{v.placeholder}</code>
                            <Input
                              placeholder={v.example || `valor para ${v.placeholder}`}
                              value={bulkParams[String(v.index)] ?? ""}
                              onChange={(e) =>
                                setBulkParams({ ...bulkParams, [String(v.index)]: e.target.value })
                              }
                            />
                          </div>
                          {v.context && (
                            <p className="text-[11px] text-muted-foreground leading-snug pl-14">
                              En el mensaje: <span className="font-mono">{v.context}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                <div className="space-y-2">
                  <Label>Cuándo enviar</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={scheduleMode === "now" ? "default" : "outline"}
                      onClick={() => setScheduleMode("now")}
                    >
                      <SendIcon className="size-4" /> Ahora
                    </Button>
                    <Button
                      size="sm"
                      variant={scheduleMode === "later" ? "default" : "outline"}
                      onClick={() => setScheduleMode("later")}
                    >
                      <CalendarClockIcon className="size-4" /> Programar
                    </Button>
                  </div>
                  {scheduleMode === "later" && (
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full max-w-sm"
                    />
                  )}
                </div>

                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <b>Resumen:</b> {total} destinatarios · plantilla{" "}
                    <code className="font-mono text-xs">{selected?.name}</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
              disabled={step === 1}
            >
              Atrás
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={
                  (step === 1 && !selected) || (step === 2 && total === 0)
                }
              >
                Siguiente <ChevronRightIcon className="size-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={isPending || total === 0 || !name.trim()}>
                {isPending ? "Guardando…" : scheduleMode === "later" ? "Programar" : "Enviar"}
              </Button>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {selected ? (
                carousel ? (
                  <CarouselPreview
                    topBody={
                      selected.components.find((c) => c.type === "BODY")?.text ??
                      ""
                    }
                    cards={carousel.cards.map((c, i) => ({
                      mediaUrl: carouselMapping.cardMedia[i] ?? (prefillMedia[`${selected.name}|${selected.language}`]?.[i] ?? null),
                      body:
                        selected.components
                          .find((comp) => comp.type === "CAROUSEL")
                          ?.cards?.[i]?.components?.find((cc) => cc.type === "BODY")
                          ?.text ?? "",
                      buttons: [],
                    }))}
                  />
                ) : (
                  <WhatsAppBubble template={selected} highlightVars size="md" />
                )
              ) : (
                <div className="text-sm text-muted-foreground">Elige una plantilla</div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StepsHeader({ step, total }: { step: Step; total: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      <StepDot n={1} label="Plantilla" active={step >= 1} current={step === 1} />
      <ChevronRightIcon className="size-3 text-muted-foreground" />
      <StepDot
        n={2}
        label={`Destinatarios${total ? ` (${total})` : ""}`}
        active={step >= 2}
        current={step === 2}
      />
      <ChevronRightIcon className="size-3 text-muted-foreground" />
      <StepDot n={3} label="Revisar" active={step >= 3} current={step === 3} />
    </ol>
  );
}

function StepDot({ n, label, active, current }: { n: number; label: string; active: boolean; current: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 ${current ? "font-semibold" : active ? "text-foreground" : "text-muted-foreground"}`}
    >
      <span
        className={`flex size-6 items-center justify-center rounded-full text-xs ${
          current ? "bg-primary text-primary-foreground" : active ? "bg-muted" : "bg-muted/50"
        }`}
      >
        {n}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
