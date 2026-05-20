"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import type { WhatsAppTemplate } from "@/lib/meta/types";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
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
import { listBodyVariableIndices } from "@/lib/template-vars";
import { createTemplateAction } from "./actions";

type ButtonKind = "QUICK_REPLY" | "URL";
type ButtonState = { id: string; kind: ButtonKind; text: string; url: string };

type HeaderKind = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

const HEADER_OPTIONS: { value: HeaderKind; label: string }[] = [
  { value: "NONE", label: "Sin header" },
  { value: "TEXT", label: "Texto" },
  { value: "IMAGE", label: "Imagen (JPG/PNG)" },
  { value: "VIDEO", label: "Video (MP4)" },
  { value: "DOCUMENT", label: "Documento (PDF)" },
];

const ACCEPT_BY_KIND: Record<"IMAGE" | "VIDEO" | "DOCUMENT", string> = {
  IMAGE: "image/jpeg,image/png",
  VIDEO: "video/mp4,video/3gpp",
  DOCUMENT: "application/pdf",
};

const LANGS = [
  { value: "es_CO", label: "Español (Colombia)" },
  { value: "es_ES", label: "Español (España)" },
  { value: "es_MX", label: "Español (México)" },
  { value: "en_US", label: "Inglés (EE.UU.)" },
  { value: "pt_BR", label: "Portugués (Brasil)" },
];

const CATEGORIES = [
  { value: "UTILITY", label: "Utility" },
  { value: "MARKETING", label: "Marketing" },
  { value: "AUTHENTICATION", label: "Autenticación" },
];

const NAME_REGEX = /^[a-z0-9_]*$/;

export function TemplateForm() {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es_CO");
  const [category, setCategory] = useState("UTILITY");

  const [headerKind, setHeaderKind] = useState<HeaderKind>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerHandle, setHeaderHandle] = useState<string | null>(null);
  const [headerFileName, setHeaderFileName] = useState<string | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [bodyText, setBodyText] = useState("");
  const [bodyExample, setBodyExample] = useState<Record<number, string>>({});

  const [hasFooter, setHasFooter] = useState(false);
  const [footerText, setFooterText] = useState("");

  const [buttons, setButtons] = useState<ButtonState[]>([]);

  const [pending, startTransition] = useTransition();

  const bodyVars = useMemo(() => listBodyVariableIndices(bodyText), [bodyText]);

  function addButton(kind: ButtonKind) {
    if (buttons.length >= 3) return;
    if (kind === "URL" && buttons.filter((b) => b.kind === "URL").length >= 2)
      return;
    setButtons((b) => [
      ...b,
      {
        id: crypto.randomUUID(),
        kind,
        text: "",
        url: "",
      },
    ]);
  }

  function updateButton(id: string, patch: Partial<ButtonState>) {
    setButtons((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function removeButton(id: string) {
    setButtons((b) => b.filter((x) => x.id !== id));
  }

  async function onHeaderFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
    setHeaderPreviewUrl(URL.createObjectURL(file));
    setHeaderFileName(file.name);
    setHeaderHandle(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/meta/upload-media", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as
        | { ok: true; handle: string; format: string }
        | { ok: false; error: string };
      if (!json.ok) {
        toast.error(json.error);
        setHeaderHandle(null);
        return;
      }
      setHeaderHandle(json.handle);
      toast.success("Archivo subido ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function clearHeaderFile() {
    if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
    setHeaderPreviewUrl(null);
    setHeaderFileName(null);
    setHeaderHandle(null);
  }

  function submit() {
    if (!NAME_REGEX.test(name) || name.length < 3) {
      toast.error("El nombre debe tener 3+ caracteres en minúsculas");
      return;
    }
    if (!bodyText.trim()) {
      toast.error("El body es obligatorio");
      return;
    }
    for (const idx of bodyVars) {
      if (!bodyExample[idx]?.trim()) {
        toast.error(`Falta ejemplo para variable {{${idx}}}`);
        return;
      }
    }
    for (const b of buttons) {
      if (!b.text.trim()) {
        toast.error("Todos los botones deben tener texto");
        return;
      }
      if (b.kind === "URL" && !/^https?:\/\/.+/.test(b.url)) {
        toast.error("Las URLs de botón deben empezar con https://");
        return;
      }
    }
    if (headerKind === "TEXT" && !headerText.trim()) {
      toast.error("El header de texto no puede estar vacío");
      return;
    }
    if (
      (headerKind === "IMAGE" ||
        headerKind === "VIDEO" ||
        headerKind === "DOCUMENT") &&
      !headerHandle
    ) {
      toast.error("Sube el archivo del header antes de enviar");
      return;
    }
    if (uploading) {
      toast.error("Espera a que termine la subida");
      return;
    }

    const payload = {
      name,
      language,
      category,
      headerType: headerKind,
      headerText: headerKind === "TEXT" ? headerText.trim() : null,
      headerHandle: headerHandle ?? null,
      bodyText,
      bodyExample: bodyVars.map((i: number) => bodyExample[i] ?? ""),
      footerText: hasFooter ? footerText.trim() : null,
      buttons: buttons.map((b) =>
        b.kind === "URL"
          ? { type: "URL" as const, text: b.text, url: b.url }
          : { type: "QUICK_REPLY" as const, text: b.text },
      ),
    };

    startTransition(async () => {
      const res = await createTemplateAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Plantilla "${res.name}" enviada a Meta (${res.status}). Aparecerá en la lista cuando se apruebe.`,
        { duration: 8000 },
      );
      setName("");
      setBodyText("");
      setBodyExample({});
      setHeaderText("");
      setFooterText("");
      setButtons([]);
      setHeaderKind("NONE");
      clearHeaderFile();
      setHasFooter(false);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Nombre (interno, único en Meta)</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="p.ej. milujo_promocion_oro"
                className="font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Solo minúsculas, números y <code>_</code>. No se puede
                cambiar después.
              </p>
            </div>
            <div>
              <Label>Idioma</Label>
              <Select
                value={language}
                onValueChange={(v) => v && setLanguage(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoría</Label>
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Utility: confirmaciones, recordatorios, notificaciones
                transaccionales. Marketing: promociones. Si el contenido
                suena promocional, Meta puede rechazar UTILITY.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Header (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select
                value={headerKind}
                onValueChange={(v) => {
                  if (!v) return;
                  const next = v as HeaderKind;
                  setHeaderKind(next);
                  if (next !== "TEXT") setHeaderText("");
                  if (
                    next !== "IMAGE" &&
                    next !== "VIDEO" &&
                    next !== "DOCUMENT"
                  ) {
                    clearHeaderFile();
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEADER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {headerKind === "TEXT" && (
              <div>
                <Label htmlFor="header-text">Texto del header (máx 60)</Label>
                <Input
                  id="header-text"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  maxLength={60}
                />
              </div>
            )}

            {(headerKind === "IMAGE" ||
              headerKind === "VIDEO" ||
              headerKind === "DOCUMENT") && (
              <div className="space-y-2">
                <Label htmlFor="header-file">
                  {headerKind === "IMAGE"
                    ? "Imagen de ejemplo (JPG o PNG, máx 5MB)"
                    : headerKind === "VIDEO"
                      ? "Video de ejemplo (MP4, máx 16MB)"
                      : "PDF de ejemplo (máx 100MB)"}
                </Label>
                <Input
                  id="header-file"
                  type="file"
                  accept={ACCEPT_BY_KIND[headerKind]}
                  onChange={onHeaderFile}
                  disabled={uploading || pending}
                />
                {uploading && (
                  <p className="text-xs text-muted-foreground">
                    Subiendo a Meta…
                  </p>
                )}
                {headerHandle && headerFileName && (
                  <div className="flex items-center justify-between rounded-md border bg-emerald-50 p-2 text-xs">
                    <span className="truncate text-emerald-900">
                      ✓ {headerFileName}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearHeaderFile}
                    >
                      Quitar
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Meta usa este archivo como muestra para aprobar la
                  plantilla. Luego cada envío puede reutilizarlo.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Body</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="body-text">
                Texto principal (máx 1024). Usa{" "}
                <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… para variables.
              </Label>
              <textarea
                id="body-text"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                maxLength={1024}
                rows={7}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none ring-0 focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                {bodyText.length}/1024 ·{" "}
                {bodyVars.length === 0
                  ? "sin variables"
                  : `${bodyVars.length} variable(s)`}
              </p>
            </div>
            {bodyVars.length > 0 && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Ejemplos requeridos por Meta
                </div>
                {bodyVars.map((idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="w-14 shrink-0 font-mono text-xs">
                      {`{{${idx}}}`}
                    </code>
                    <Input
                      value={bodyExample[idx] ?? ""}
                      onChange={(e) =>
                        setBodyExample((s) => ({
                          ...s,
                          [idx]: e.target.value,
                        }))
                      }
                      placeholder="ejemplo real"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Checkbox
                id="has-footer"
                checked={hasFooter}
                onCheckedChange={(v) => setHasFooter(Boolean(v))}
              />
              <Label htmlFor="has-footer" className="cursor-pointer">
                <CardTitle className="text-base">Footer (opcional)</CardTitle>
              </Label>
            </div>
          </CardHeader>
          {hasFooter && (
            <CardContent>
              <Label htmlFor="footer-text">Texto (máx 60, sin variables)</Label>
              <Input
                id="footer-text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                maxLength={60}
              />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Botones (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {buttons.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-end gap-2 rounded-md border p-3"
              >
                <div className="min-w-[100px]">
                  <Label className="text-[11px]">Tipo</Label>
                  <Badge variant="secondary" className="mt-1 block w-fit">
                    {b.kind === "URL" ? "URL" : "Respuesta rápida"}
                  </Badge>
                </div>
                <div className="min-w-[150px] flex-1">
                  <Label className="text-[11px]">Texto (máx 25)</Label>
                  <Input
                    value={b.text}
                    maxLength={25}
                    onChange={(e) =>
                      updateButton(b.id, { text: e.target.value })
                    }
                  />
                </div>
                {b.kind === "URL" && (
                  <div className="min-w-[200px] flex-1">
                    <Label className="text-[11px]">URL</Label>
                    <Input
                      value={b.url}
                      placeholder="https://..."
                      onChange={(e) =>
                        updateButton(b.id, { url: e.target.value })
                      }
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeButton(b.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addButton("QUICK_REPLY")}
                disabled={buttons.length >= 3}
              >
                + Respuesta rápida
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addButton("URL")}
                disabled={
                  buttons.length >= 3 ||
                  buttons.filter((b) => b.kind === "URL").length >= 2
                }
              >
                + Botón URL
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Máx 3 botones. Si hay URL, solo se permiten hasta 2 de URL.
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/plantillas"
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancelar
          </Link>
          <Button onClick={submit} disabled={pending} size="lg">
            {pending ? "Enviando a Meta…" : "Enviar a Meta para aprobación"}
          </Button>
        </div>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <Preview
              headerKind={headerKind}
              headerText={headerText}
              headerFileName={headerFileName}
              headerPreviewUrl={headerPreviewUrl}
              bodyText={bodyText}
              bodyExample={bodyExample}
              bodyVars={bodyVars}
              hasFooter={hasFooter}
              footerText={footerText}
              buttons={buttons}
            />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Preview({
  headerKind,
  headerText,
  headerFileName,
  headerPreviewUrl,
  bodyText,
  bodyExample,
  bodyVars,
  hasFooter,
  footerText,
  buttons,
}: {
  headerKind: HeaderKind;
  headerText: string;
  headerFileName: string | null;
  headerPreviewUrl: string | null;
  bodyText: string;
  bodyExample: Record<number, string>;
  bodyVars: number[];
  hasFooter: boolean;
  footerText: string;
  buttons: ButtonState[];
}) {
  const headerComponent =
    headerKind === "TEXT" && headerText
      ? { type: "HEADER" as const, format: "TEXT", text: headerText }
      : headerKind === "IMAGE" ||
          headerKind === "VIDEO" ||
          headerKind === "DOCUMENT"
        ? { type: "HEADER" as const, format: headerKind }
        : null;

  const template: WhatsAppTemplate = {
    id: "__preview__",
    name: "preview",
    category: "UTILITY",
    language: "es_CO",
    status: "APPROVED",
    components: [
      ...(headerComponent ? [headerComponent] : []),
      {
        type: "BODY" as const,
        text: bodyText || "…",
      },
      ...(hasFooter && footerText
        ? [{ type: "FOOTER" as const, text: footerText }]
        : []),
      ...(buttons.length > 0
        ? [
            {
              type: "BUTTONS" as const,
              buttons: buttons.map((b) => ({
                type: b.kind,
                text: b.text || "(texto del botón)",
                ...(b.kind === "URL" ? { url: b.url } : {}),
              })),
            },
          ]
        : []),
    ],
  };
  const values: Record<string, string> = {};
  for (const idx of bodyVars) {
    const v = bodyExample[idx];
    if (v?.trim()) values[String(idx)] = v;
  }
  return (
    <WhatsAppBubble
      template={template}
      values={values}
      highlightVars
      size="md"
      mediaPreview={
        headerPreviewUrl || headerFileName
          ? {
              url: headerPreviewUrl ?? undefined,
              fileName: headerFileName ?? undefined,
            }
          : undefined
      }
    />
  );
}
