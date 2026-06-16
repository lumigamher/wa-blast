"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { read, utils } from "xlsx";
import { CalendarClockIcon, ChevronRightIcon, SendIcon, StarIcon, UploadIcon, UsersIcon, SearchIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
import { FavoriteButton } from "@/components/favorite-button";
import type { WhatsAppTemplate } from "@/lib/meta/types";
import { extractVariables, getBodyComponent } from "@/lib/templates";
import { isCarousel, parseCarousel } from "@/lib/meta/carousel";
import { CarouselMapping, type CarouselMappingValue } from "./carousel-mapping";
import { CarouselPreview } from "@/components/carousel-preview";
import { buildCarouselPlan } from "@/lib/campaigns/build-carousel-plan";
import { createCampaignAction } from "./actions";

type Step = 1 | 2 | 3;
type Source = "tags" | "adhoc" | "contacts";

type TagRow = { id: string; name: string; color: string; count: number };

type ContactRow = { id: string; name: string | null; phone: string };

type AdhocRow = { phone: string; name: string; params: Record<string, string> };

type FlowRow = { id: string; name: string };

type SendMode = "template" | "flow";

export function Wizard({
  templates,
  flows = [],
  tags,
  contacts = [],
  prefillMedia = {},
  initialTemplateKey,
  initialFavorites = [],
}: {
  templates: WhatsAppTemplate[];
  flows?: FlowRow[];
  tags: TagRow[];
  contacts?: ContactRow[];
  prefillMedia?: Record<string, Record<number, string>>;
  initialTemplateKey?: string;
  initialFavorites?: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [isPending, startTransition] = useTransition();

  const favorites = useMemo(() => new Set(initialFavorites), [initialFavorites]);
  const approved = useMemo(() => templates.filter((t) => t.status === "APPROVED"), [templates]);
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    // Prefer initialTemplateKey if provided and exists
    if (initialTemplateKey && approved.some((t) => `${t.name}|${t.language}` === initialTemplateKey)) {
      return initialTemplateKey;
    }
    // Otherwise, prefer a favorite from approved templates
    const favoriteApproved = approved.find((t) => favorites.has(`${t.name}|${t.language}`));
    if (favoriteApproved) {
      return `${favoriteApproved.name}|${favoriteApproved.language}`;
    }
    // Fall back to first approved template
    return approved[0] ? `${approved[0].name}|${approved[0].language}` : "";
  });
  const selected = useMemo(
    () => approved.find((t) => `${t.name}|${t.language}` === selectedKey),
    [approved, selectedKey],
  );
  const vars = useMemo(() => (selected ? extractVariables(selected) : []), [selected]);
  const carousel = useMemo(
    () => (selected && isCarousel(selected) ? parseCarousel(selected) : null),
    [selected],
  );

  // Send mode toggle: template or flow
  const [sendMode, setSendMode] = useState<SendMode>("template");

  // Flow mode state
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  const [flowCta, setFlowCta] = useState<string>("Abrir formulario");
  const [flowBodyText, setFlowBodyText] = useState<string>("");

  const [source, setSource] = useState<Source>("tags");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [adhocRows, setAdhocRows] = useState<AdhocRow[]>([]);

  // Favorites UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Contacts UI state
  const [contactSearchQuery, setContactSearchQuery] = useState("");

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
  const total = source === "tags" ? tagsCount : source === "contacts" ? selectedContactIds.size : adhocRows.length;

  // Compute visible templates for Step 1 (includes non-APPROVED if showAll is true)
  const visibleTemplates = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const pool = showAll ? templates : approved;
    const filtered = pool.filter((t) => {
      const key = `${t.name}|${t.language}`;
      if (onlyFavorites && !favorites.has(key)) return false;
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
  }, [templates, approved, searchQuery, onlyFavorites, showAll, favorites]);

  const favCount = approved.filter((t) =>
    favorites.has(`${t.name}|${t.language}`),
  ).length;

  function togglTag(id: string) {
    const next = new Set(selectedTagIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTagIds(next);
  }

  function toggleContact(id: string) {
    const next = new Set(selectedContactIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedContactIds(next);
  }

  const visibleContacts = useMemo(() => {
    const needle = contactSearchQuery.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) =>
      (c.name?.toLowerCase() ?? "").includes(needle) ||
      c.phone.includes(needle)
    );
  }, [contacts, contactSearchQuery]);

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
    if (!name.trim()) return toast.error("Ponle un nombre a la campaña");

    // Flow mode
    if (sendMode === "flow") {
      if (!selectedFlowId) return toast.error("Selecciona un flujo");
      if (!flowBodyText.trim()) return toast.error("Escribe un mensaje acompañante");

      const selectedFlow = flows.find((f) => f.id === selectedFlowId);
      if (!selectedFlow) return toast.error("Flujo no encontrado");

      const plan = {
        kind: "flow" as const,
        flowId: selectedFlowId,
        cta: flowCta || "Abrir formulario",
        bodyText: flowBodyText,
      };

      const payload = {
        name: name.trim(),
        templateName: `flow:${selectedFlow.name}`,
        templateLanguage: "",
        templateType: "flow" as const,
        componentPlanJson: JSON.stringify(plan),
        source,
        tagIds: source === "tags" ? [...selectedTagIds] : undefined,
        contactIds: source === "contacts" ? [...selectedContactIds] : undefined,
        adhocRows:
          source === "adhoc"
            ? adhocRows.map((r) => ({
                phone: r.phone,
                name: r.name,
                params: {},
              }))
            : undefined,
        scheduledAt: scheduleMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      };

      launch(payload);
      return;
    }

    // Template mode
    if (!selected) return toast.error("Selecciona una plantilla");

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

    // Standard template flow
    const paramsByContact: Record<string, Record<string, string>> | undefined =
      source === "tags" && Object.keys(bulkParams).length > 0 ? undefined : undefined;

    const payload = {
      name: name.trim(),
      templateName: selected.name,
      templateLanguage: selected.language,
      source,
      tagIds: source === "tags" ? [...selectedTagIds] : undefined,
      contactIds: source === "contacts" ? [...selectedContactIds] : undefined,
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

  if (approved.length === 0 && flows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-sm text-muted-foreground">No tienes plantillas aprobadas ni flujos publicados en Meta.</div>
          <div className="flex gap-2">
            <a href="/plantillas/nueva" className={buttonVariants({ size: "sm" })}>
              Crear plantilla
            </a>
            <a href="/flows/nueva" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Crear flujo
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {step === 1 && (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle>Escoge la plantilla</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {approved.length} aprobadas · {favCount} favorita{favCount === 1 ? "" : "s"} · {templates.length} en total
                </p>
              </CardHeader>
              {/* Mode toggle: Template vs Flow */}
              <div className="border-b px-6 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSendMode("template")}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                      sendMode === "template"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    Plantilla
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMode("flow")}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                      sendMode === "flow"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    Flujo (formulario)
                  </button>
                </div>
              </div>
              <CardContent className="space-y-5">
                {sendMode === "template" && (
                  <>
                    {/* Search and filter controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-64 flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar plantilla por nombre…"
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
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

                {/* Template grid */}
                {visibleTemplates.length === 0 ? (
                  <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                    Ninguna plantilla coincide.
                  </div>
                ) : (
                  <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleTemplates.map((t) => {
                      const key = `${t.name}|${t.language}`;
                      const isSelected = key === selectedKey;
                      const isFavorited = favorites.has(key);
                      return (
                        <TemplateCard
                          key={key}
                          template={t}
                          active={isSelected}
                          favorited={isFavorited}
                          onSelect={() => setSelectedKey(key)}
                        />
                      );
                    })}
                  </div>
                )}

                {selected && selected.status !== "APPROVED" ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                    La plantilla seleccionada está{" "}
                    <span className="font-semibold">{selected.status}</span> en Meta —
                    no la podrás disparar hasta que Meta la apruebe.
                  </p>
                ) : null}
                  </>
                )}

                {sendMode === "flow" && (
                  <div className="space-y-4">
                    {flows.length === 0 ? (
                      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                        <p>No tienes flujos publicados.</p>
                        <a href="/flows/nueva" className={buttonVariants({ size: "sm", className: "mt-2" })}>
                          Crear flujo
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Label htmlFor="flow-select" className="text-sm font-medium">
                          Selecciona un flujo
                        </Label>
                        <select
                          id="flow-select"
                          value={selectedFlowId}
                          onChange={(e) => setSelectedFlowId(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                          <option value="">-- Selecciona un flujo --</option>
                          {flows.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {flows.length > 0 && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="flow-cta" className="text-sm font-medium">
                            Texto del botón
                          </Label>
                          <Input
                            id="flow-cta"
                            placeholder="Ej: Abrir formulario"
                            value={flowCta}
                            onChange={(e) => setFlowCta(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="flow-body" className="text-sm font-medium">
                            Mensaje acompañante
                          </Label>
                          <textarea
                            id="flow-body"
                            placeholder="Mensaje que aparecerá antes del botón del flujo..."
                            value={flowBodyText}
                            onChange={(e) => setFlowBodyText(e.target.value)}
                            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
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
                    variant={source === "contacts" ? "default" : "outline"}
                    onClick={() => setSource("contacts")}
                  >
                    <UsersIcon className="size-4" /> Contactos
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
                        <Link href="/contactos/tags" className="underline">
                          Crear tag
                        </Link>{" "}
                        o{" "}
                        <Link href="/contactos/import" className="underline">
                          importa contactos
                        </Link>
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

                {source === "contacts" && (
                  <div className="space-y-3">
                    {contacts.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No tienes contactos guardados.{" "}
                        <Link href="/contactos/import" className="underline">
                          Importa contactos
                        </Link>
                        .
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Buscar por nombre o teléfono…"
                            className="pl-9"
                            value={contactSearchQuery}
                            onChange={(e) => setContactSearchQuery(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{selectedContactIds.size} seleccionados de {visibleContacts.length}</span>
                        </div>
                        <ul className="max-h-[20rem] overflow-y-auto space-y-1 rounded-md border p-2">
                          {visibleContacts.length === 0 ? (
                            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                              Ningún contacto coincide.
                            </li>
                          ) : (
                            visibleContacts.map((c) => (
                              <li
                                key={c.id}
                                className="flex items-center gap-3 rounded-md border p-2 hover:bg-muted/50"
                              >
                                <Checkbox
                                  id={`contact-${c.id}`}
                                  checked={selectedContactIds.has(c.id)}
                                  onCheckedChange={() => toggleContact(c.id)}
                                />
                                <Label htmlFor={`contact-${c.id}`} className="flex-1 cursor-pointer text-sm">
                                  <div className="font-medium">{c.name || "Sin nombre"}</div>
                                  <div className="text-xs text-muted-foreground">{c.phone}</div>
                                </Label>
                              </li>
                            ))
                          )}
                        </ul>
                      </>
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
                <CardTitle>Revisar y enviar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 4-column stat grid */}
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">
                      {sendMode === "template" ? "Plantilla" : "Flujo"}
                    </div>
                    <div className="font-semibold">
                      {sendMode === "template" ? selected?.name : flows.find((f) => f.id === selectedFlowId)?.name}
                    </div>
                  </div>
                  {sendMode === "template" && (
                    <div className="rounded-md border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Idioma</div>
                      <div className="font-semibold">{selected?.language.toUpperCase()}</div>
                    </div>
                  )}
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">Fuente</div>
                    <div className="font-semibold">
                      {source === "tags" ? "Tags" : source === "contacts" ? "Contactos" : "CSV/Excel"}
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs text-muted-foreground">Destinatarios</div>
                    <div className="font-semibold">{total}</div>
                  </div>
                </div>

                {/* Campaign name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre de la campaña</Label>
                  <Input
                    id="name"
                    placeholder="Ej. Promo Abril 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {sendMode === "template" && (
                  <>
                    {/* WhatsApp bubble preview */}
                    <div className="space-y-2">
                      <Label>Previsualización (primer destinatario)</Label>
                      {selected ? (
                        <div className="mx-auto max-w-sm">
                          <WhatsAppBubble template={selected} highlightVars size="md" />
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Selecciona una plantilla</div>
                      )}
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
                  </>
                )}

                {sendMode === "flow" && (
                  <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-blue-900">Flujo: {flows.find((f) => f.id === selectedFlowId)?.name}</p>
                      <p className="text-xs text-blue-700">
                        Botón: <span className="font-semibold">{flowCta || "Abrir formulario"}</span>
                      </p>
                      {flowBodyText && (
                        <p className="text-xs text-blue-700 mt-2">
                          Mensaje: <span className="italic">{flowBodyText}</span>
                        </p>
                      )}
                    </div>
                  </div>
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

                {/* Non-APPROVED warning */}
                {selected && selected.status !== "APPROVED" ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    Plantilla en estado <span className="font-semibold">{selected.status}</span> — Meta aún
                    no la ha aprobado. El envío se habilitará automáticamente cuando
                    pase a APPROVED (sin redeploy).
                  </div>
                ) : null}
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setScheduleMode(scheduleMode === "now" ? "later" : "now")}
                  disabled={isPending || total === 0 || !name.trim() || selected?.status !== "APPROVED"}
                  className="gap-2"
                >
                  <CalendarClockIcon className="size-4" />
                  Programar envío
                </Button>
                <Button
                  onClick={submit}
                  disabled={isPending || total === 0 || !name.trim() || selected?.status !== "APPROVED"}
                  className="gap-2"
                >
                  <SendIcon className="size-4" />
                  {isPending
                    ? "Enviando..."
                    : selected?.status !== "APPROVED"
                      ? "Plantilla no aprobada"
                      : scheduleMode === "later"
                        ? `Programar para ${scheduledAt ? new Date(scheduledAt).toLocaleDateString("es-CO") : ""}`
                        : `Enviar a ${total} ahora`}
                </Button>
              </div>
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

function Stepper({ step }: { step: Step }) {
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
