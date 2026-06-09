"use client";

import { languageLabel } from "@/lib/languages";
import type { TemplateDraft } from "../template-wizard";

export function StepRevisar({ draft }: { draft: TemplateDraft }) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Revisar y enviar</h2>
      <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
        <dt className="text-muted-foreground">Tipo</dt><dd>{draft.type === "carousel" ? "Carrusel" : "Estándar"}</dd>
        <dt className="text-muted-foreground">Nombre</dt><dd className="font-mono">{draft.name}</dd>
        <dt className="text-muted-foreground">Idioma</dt><dd>{languageLabel(draft.language)}</dd>
        <dt className="text-muted-foreground">Categoría</dt><dd>{draft.category}</dd>
        {draft.type === "carousel" && (<><dt className="text-muted-foreground">Tarjetas</dt><dd>{draft.carousel.cards.length}</dd></>)}
      </dl>
      <p className="text-xs text-muted-foreground">Revisa la vista previa a la derecha. Al enviar, Meta la revisa (normalmente &lt;24h) y aparecerá aprobada en tus plantillas.</p>
    </div>
  );
}
