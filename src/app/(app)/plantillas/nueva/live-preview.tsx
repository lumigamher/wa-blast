"use client";

import type { WhatsAppTemplate } from "@/lib/meta/types";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
import { CarouselPreview } from "@/components/carousel-preview";
import { listBodyVariableIndices } from "@/lib/template-vars";
import type { TemplateDraft } from "./template-wizard";

export function LivePreview({ draft }: { draft: TemplateDraft }) {
  if (draft.type === "carousel") {
    return (
      <CarouselPreview
        topBody={draft.bodyText || ""}
        cards={draft.carousel.cards.map((c) => ({
          mediaUrl: c.publicUrl,
          body: c.body || "…",
          buttons: c.buttons.map((b) => b.text || "(botón)"),
        }))}
      />
    );
  }

  const bodyVars = listBodyVariableIndices(draft.bodyText);
  const headerComponent =
    draft.headerKind === "TEXT" && draft.headerText
      ? { type: "HEADER" as const, format: "TEXT", text: draft.headerText }
      : draft.headerKind === "IMAGE" || draft.headerKind === "VIDEO" || draft.headerKind === "DOCUMENT"
        ? { type: "HEADER" as const, format: draft.headerKind }
        : null;
  const template: WhatsAppTemplate = {
    id: "__preview__",
    name: "preview",
    category: "UTILITY",
    language: "es_CO",
    status: "APPROVED",
    components: [
      ...(headerComponent ? [headerComponent] : []),
      { type: "BODY" as const, text: draft.bodyText || "…" },
      ...(draft.hasFooter && draft.footerText ? [{ type: "FOOTER" as const, text: draft.footerText }] : []),
      ...(draft.buttons.length > 0
        ? [{ type: "BUTTONS" as const, buttons: draft.buttons.map((b) => ({ type: b.kind, text: b.text || "(botón)", ...(b.kind === "URL" ? { url: b.url } : {}) })) }]
        : []),
    ],
  };
  const values: Record<string, string> = {};
  for (const idx of bodyVars) {
    const v = draft.bodyExample[idx];
    if (v?.trim()) values[String(idx)] = v;
  }
  return (
    <WhatsAppBubble
      template={template}
      values={values}
      highlightVars
      size="md"
      mediaPreview={draft.headerPreviewUrl || draft.headerFileName ? { url: draft.headerPreviewUrl ?? undefined, fileName: draft.headerFileName ?? undefined } : undefined}
    />
  );
}
