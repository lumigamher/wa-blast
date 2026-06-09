"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CarouselBuilder } from "../carousel-builder";
import type { TemplateDraft } from "../template-wizard";

export function StepTarjetas({ draft, update }: { draft: TemplateDraft; update: (p: Partial<TemplateDraft>) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Tarjetas del carrusel</h2>
      <div>
        <Label htmlFor="carousel-top">Texto antes de las tarjetas (máx 160)</Label>
        <Input id="carousel-top" value={draft.bodyText} maxLength={160}
          onChange={(e) => update({ bodyText: e.target.value })} placeholder="Mira estas opciones…" />
      </div>
      <CarouselBuilder value={draft.carousel} onChange={(carousel) => update({ carousel })} />
    </div>
  );
}
