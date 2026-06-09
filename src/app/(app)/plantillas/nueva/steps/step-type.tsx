"use client";

import { Layers2Icon, MessageSquareIcon, LayoutGridIcon, ShieldCheckIcon } from "lucide-react";
import type { TemplateDraft } from "../template-wizard";

const TYPES = [
  { id: "standard", label: "Estándar", desc: "Texto, imagen/video, botones", Icon: MessageSquareIcon, enabled: true },
  { id: "carousel", label: "Carrusel", desc: "Tarjetas deslizables con media", Icon: LayoutGridIcon, enabled: true },
  { id: "flow", label: "Flow", desc: "Formularios interactivos", Icon: Layers2Icon, enabled: false },
  { id: "auth", label: "Auth / OTP", desc: "Códigos de verificación", Icon: ShieldCheckIcon, enabled: false },
] as const;

export function StepType({ draft, update }: { draft: TemplateDraft; update: (p: Partial<TemplateDraft>) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">¿Qué tipo de plantilla?</h2>
        <p className="text-sm text-muted-foreground">Elige el formato. Podrás cambiarlo mientras no la envíes.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TYPES.map((t) => {
          const selected = draft.type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={!t.enabled}
              onClick={() => t.enabled && update({ type: t.id as TemplateDraft["type"] })}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${selected ? "border-primary ring-1 ring-primary" : "border-input"} ${t.enabled ? "hover:border-primary/60" : "cursor-not-allowed opacity-50"}`}
            >
              <t.Icon className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {t.label}
                  {!t.enabled && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Próximamente</span>}
                </div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
