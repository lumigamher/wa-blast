"use client";

import { useMemo } from "react";
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
import { toast } from "sonner";
import { listBodyVariableIndices } from "@/lib/template-vars";
import type { TemplateDraft } from "../template-wizard";

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

export function StepContenido({
  draft,
  update,
  uploading,
  setUploading,
}: {
  draft: TemplateDraft;
  update: (p: Partial<TemplateDraft>) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}) {
  const bodyVars = useMemo(
    () => listBodyVariableIndices(draft.bodyText),
    [draft.bodyText]
  );

  async function onHeaderFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (draft.headerPreviewUrl) URL.revokeObjectURL(draft.headerPreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    update({
      headerPreviewUrl: previewUrl,
      headerFileName: file.name,
      headerHandle: null,
    });
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
        update({ headerHandle: null });
        return;
      }
      update({ headerHandle: json.handle });
      toast.success("Archivo subido ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function clearHeaderFile() {
    if (draft.headerPreviewUrl) URL.revokeObjectURL(draft.headerPreviewUrl);
    update({
      headerPreviewUrl: null,
      headerFileName: null,
      headerHandle: null,
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Contenido</h2>

      {/* Header Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select
              value={draft.headerKind}
              onValueChange={(v) => {
                if (!v) return;
                const next = v as HeaderKind;
                if (draft.headerPreviewUrl)
                  URL.revokeObjectURL(draft.headerPreviewUrl);
                update({
                  headerKind: next,
                  ...(next !== "TEXT" ? { headerText: "" } : {}),
                  ...(next !== "IMAGE" &&
                  next !== "VIDEO" &&
                  next !== "DOCUMENT"
                    ? {
                        headerHandle: null,
                        headerFileName: null,
                        headerPreviewUrl: null,
                      }
                    : {}),
                });
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

          {draft.headerKind === "TEXT" && (
            <div>
              <Label htmlFor="header-text">Texto del header (máx 60)</Label>
              <Input
                id="header-text"
                value={draft.headerText}
                onChange={(e) => update({ headerText: e.target.value })}
                maxLength={60}
              />
            </div>
          )}

          {(draft.headerKind === "IMAGE" ||
            draft.headerKind === "VIDEO" ||
            draft.headerKind === "DOCUMENT") && (
            <div className="space-y-2">
              <Label htmlFor="header-file">
                {draft.headerKind === "IMAGE"
                  ? "Imagen de ejemplo (JPG o PNG, máx 5MB)"
                  : draft.headerKind === "VIDEO"
                    ? "Video de ejemplo (MP4, máx 16MB)"
                    : "PDF de ejemplo (máx 100MB)"}
              </Label>
              <Input
                id="header-file"
                type="file"
                accept={ACCEPT_BY_KIND[draft.headerKind]}
                onChange={onHeaderFile}
                disabled={uploading}
              />
              {uploading && (
                <p className="text-xs text-muted-foreground">
                  Subiendo a Meta…
                </p>
              )}
              {draft.headerHandle && draft.headerFileName && (
                <div className="flex items-center justify-between rounded-md border bg-emerald-50 p-2 text-xs">
                  <span className="truncate text-emerald-900">
                    ✓ {draft.headerFileName}
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
                Meta usa este archivo como muestra para aprobar la plantilla.
                Luego cada envío puede reutilizarlo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Body Section */}
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
              value={draft.bodyText}
              onChange={(e) => update({ bodyText: e.target.value })}
              maxLength={1024}
              rows={7}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none ring-0 focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              {draft.bodyText.length}/1024 ·{" "}
              {bodyVars.length === 0
                ? "sin variables"
                : `${bodyVars.length} variable(s)`}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Usa {"{"}1{"}"}, {"{"}2{"}"}… para personalizar. Meta pide un ejemplo real de
              cada variable.
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
                    value={draft.bodyExample[idx] ?? ""}
                    onChange={(e) =>
                      update({
                        bodyExample: {
                          ...draft.bodyExample,
                          [idx]: e.target.value,
                        },
                      })
                    }
                    placeholder="ejemplo real"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="has-footer"
              checked={draft.hasFooter}
              onCheckedChange={(v) => update({ hasFooter: Boolean(v) })}
            />
            <Label htmlFor="has-footer" className="cursor-pointer">
              <CardTitle className="text-base">Footer (opcional)</CardTitle>
            </Label>
          </div>
        </CardHeader>
        {draft.hasFooter && (
          <CardContent>
            <Label htmlFor="footer-text">Texto (máx 60, sin variables)</Label>
            <Input
              id="footer-text"
              value={draft.footerText}
              onChange={(e) => update({ footerText: e.target.value })}
              maxLength={60}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
