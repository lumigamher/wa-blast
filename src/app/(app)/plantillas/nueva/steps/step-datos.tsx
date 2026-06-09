"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeTemplateName } from "@/lib/template-name";
import { LANGUAGES } from "@/lib/languages";
import type { TemplateDraft } from "../template-wizard";

const CATEGORIES: { value: TemplateDraft["category"]; label: string; hint: string }[] = [
  { value: "UTILITY", label: "Utility", hint: "Confirmaciones, recordatorios, avisos transaccionales." },
  { value: "MARKETING", label: "Marketing", hint: "Promociones y novedades." },
  { value: "AUTHENTICATION", label: "Autenticación", hint: "Códigos de verificación (OTP)." },
];

export function StepDatos({ draft, update }: { draft: TemplateDraft; update: (p: Partial<TemplateDraft>) => void }) {
  const catHint = CATEGORIES.find((c) => c.value === draft.category)?.hint;
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Datos de la plantilla</h2>

      <div>
        <Label htmlFor="tpl-name">Nombre</Label>
        <Input
          id="tpl-name"
          value={draft.name}
          onChange={(e) => update({ name: normalizeTemplateName(e.target.value, { live: true }) })}
          onBlur={() => update({ name: normalizeTemplateName(draft.name) })}
          placeholder="Promo Oro Día"
          className="font-mono"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Meta verá: <code className="rounded bg-muted px-1">{draft.name || "…"}</code>. Se normaliza solo (minúsculas, sin acentos, <code>_</code> en vez de espacios). <strong>No se puede cambiar después.</strong>
        </p>
      </div>

      <div>
        <Label>Idioma</Label>
        <Select value={draft.language} onValueChange={(v) => v && update({ language: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>{l.flag} {l.nativeName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">El idioma en que escribirás el contenido.</p>
      </div>

      <div>
        <Label>Categoría</Label>
        <Select value={draft.category} onValueChange={(v) => v && update({ category: v as TemplateDraft["category"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {catHint && <p className="mt-1 text-[11px] text-muted-foreground">{catHint} Si el contenido suena promocional, Meta puede rechazar UTILITY.</p>}
      </div>
    </div>
  );
}
