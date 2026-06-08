"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ParsedCarousel } from "@/lib/meta/carousel";

export type VarMapping = Record<string, { kind: "field" | "literal"; value: string }>;
export type CarouselMappingValue = { vars: VarMapping; cardMedia: Record<number, string> };

const FIELDS = ["name", "phone", "email"];

export function CarouselMapping({
  parsed, prefillMedia, value, onChange,
}: {
  parsed: ParsedCarousel;
  prefillMedia: Record<number, string>;
  value: CarouselMappingValue;
  onChange: (v: CarouselMappingValue) => void;
}) {
  const allKeys = [...parsed.topBodyVarKeys, ...parsed.cards.flatMap((c) => [...c.bodyVarKeys, ...c.buttons.flatMap((b) => (b.dynamicUrlSuffixKey ? [b.dynamicUrlSuffixKey] : []))])];

  function setVar(key: string, patch: Partial<{ kind: "field" | "literal"; value: string }>) {
    onChange({ ...value, vars: { ...value.vars, [key]: { kind: "literal", value: "", ...value.vars[key], ...patch } } });
  }

  return (
    <div className="space-y-4">
      {allKeys.map((key) => {
        const m = value.vars[key] ?? { kind: "literal" as const, value: "" };
        return (
          <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Label className="text-xs font-mono">{key}</Label>
            <select className="rounded border bg-background px-2 py-1 text-xs" value={m.kind}
              onChange={(e) => setVar(key, { kind: e.target.value as "field" | "literal" })}>
              <option value="literal">Valor fijo</option>
              <option value="field">Campo</option>
            </select>
            {m.kind === "field" ? (
              <select className="rounded border bg-background px-2 py-1 text-xs" value={m.value}
                onChange={(e) => setVar(key, { value: e.target.value })}>
                <option value="">—</option>
                {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            ) : (
              <Input className="h-7 text-xs" value={m.value} onChange={(e) => setVar(key, { value: e.target.value })} />
            )}
          </div>
        );
      })}
      <div className="space-y-2">
        <Label className="text-xs">Media por tarjeta (URL pública)</Label>
        {parsed.cards.map((_, i) => (
          <Input key={i} className="h-7 text-xs"
            value={value.cardMedia[i] ?? prefillMedia[i] ?? ""}
            placeholder={`Tarjeta ${i + 1}`}
            onChange={(e) => onChange({ ...value, cardMedia: { ...value.cardMedia, [i]: e.target.value } })} />
        ))}
      </div>
    </div>
  );
}
