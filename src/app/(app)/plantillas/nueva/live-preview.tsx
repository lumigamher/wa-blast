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

  if (draft.type === "auth") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">WhatsApp</p>
          <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-2">
            <p><strong>123456</strong> es tu código de verificación.</p>
            {draft.addSecurityRecommendation && (
              <p className="text-xs text-muted-foreground">Por tu seguridad, no compartas este código.</p>
            )}
            {draft.codeExpirationMinutes && (
              <p className="text-xs text-muted-foreground">Este código caduca en {draft.codeExpirationMinutes} minutos.</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 rounded border border-slate-300 bg-white py-2 px-3 text-xs font-medium hover:bg-slate-50 transition">
            {draft.otpButtonText || "Copiar código"}
          </button>
        </div>
      </div>
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
