"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listBodyVariableIndices } from "@/lib/template-vars";
import { validateDatos, validateContenido, validateBotones, validateTarjetas } from "@/lib/template-validation";
import { createTemplateAction, createCarouselTemplateAction } from "./actions";
import { CarouselValue, emptyCard } from "./carousel-builder";
import { LivePreview } from "./live-preview";
import { StepType } from "./steps/step-type";
import { StepDatos } from "./steps/step-datos";
import { StepContenido } from "./steps/step-contenido";
import { StepBotones } from "./steps/step-botones";
import { StepTarjetas } from "./steps/step-tarjetas";
import { StepRevisar } from "./steps/step-revisar";

export type ButtonState = { id: string; kind: "QUICK_REPLY" | "URL" | "FLOW"; text: string; url: string; flowId?: string };
export type FlowOption = { id: string; name: string };
export type TemplateDraft = {
  type: "standard" | "carousel";
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  headerKind: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText: string;
  headerHandle: string | null;
  headerFileName: string | null;
  headerPreviewUrl: string | null;
  bodyText: string;
  bodyExample: Record<number, string>;
  hasFooter: boolean;
  footerText: string;
  buttons: ButtonState[];
  carousel: CarouselValue;
};

const INITIAL: TemplateDraft = {
  type: "standard",
  name: "",
  language: "es_CO",
  category: "UTILITY",
  headerKind: "NONE",
  headerText: "",
  headerHandle: null,
  headerFileName: null,
  headerPreviewUrl: null,
  bodyText: "",
  bodyExample: {},
  hasFooter: false,
  footerText: "",
  buttons: [],
  carousel: { cards: [emptyCard(), emptyCard()] },
};

type StepId = "type" | "datos" | "contenido" | "botones" | "tarjetas" | "revisar";
const STEP_LABEL: Record<StepId, string> = {
  type: "Tipo",
  datos: "Datos",
  contenido: "Contenido",
  botones: "Botones",
  tarjetas: "Tarjetas",
  revisar: "Revisar",
};

export interface TemplateWizardProps {
  flows?: FlowOption[];
}

export function TemplateWizard({ flows = [] }: TemplateWizardProps) {
  const [draft, setDraft] = useState<TemplateDraft>(INITIAL);
  const [uploading, setUploading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [pending, startTransition] = useTransition();

  const update = (patch: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const steps: StepId[] = useMemo(
    () => (draft.type === "carousel" ? ["type", "datos", "tarjetas", "revisar"] : ["type", "datos", "contenido", "botones", "revisar"]),
    [draft.type],
  );
  const current = steps[Math.min(stepIdx, steps.length - 1)];

  const stepErrors = (id: StepId): string[] => {
    if (id === "datos") return validateDatos(draft);
    if (id === "contenido") return validateContenido({ ...draft, uploading });
    if (id === "botones") return validateBotones(draft.buttons);
    if (id === "tarjetas") return validateTarjetas(draft.carousel);
    return [];
  };
  const canAdvance = stepErrors(current).length === 0;

  function reset() {
    setDraft(INITIAL);
    setStepIdx(0);
  }

  function submit() {
    const blocking = steps.flatMap(stepErrors);
    if (blocking.length > 0) {
      toast.error(blocking[0]);
      return;
    }
    if (draft.type === "carousel") {
      startTransition(async () => {
        const res = await createCarouselTemplateAction({
          name: draft.name,
          language: draft.language,
          category: draft.category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
          body: draft.bodyText,
          bodyExample: "",
          cards: draft.carousel.cards.map((c) => ({
            headerFormat: c.headerFormat,
            handle: c.handle!,
            assetId: c.assetId!,
            body: c.body,
            bodyExample: c.bodyExample,
            buttons: c.buttons,
          })),
        });
        if (!res.ok) {
          toast.error(res.error);
        } else {
          toast.success(`Plantilla carrusel "${res.name}" enviada a Meta (${res.status}).`, { duration: 8000 });
          reset();
        }
      });
      return;
    }
    startTransition(async () => {
      const res = await createTemplateAction({
        name: draft.name,
        language: draft.language,
        category: draft.category,
        headerType: draft.headerKind,
        headerText: draft.headerKind === "TEXT" ? draft.headerText.trim() : null,
        headerHandle: draft.headerHandle ?? null,
        bodyText: draft.bodyText,
        bodyExample: listExamples(draft),
        footerText: draft.hasFooter ? draft.footerText.trim() : null,
        buttons: draft.buttons.map((b) =>
          b.kind === "URL" ? { type: "URL" as const, text: b.text, url: b.url } :
          b.kind === "FLOW" ? { type: "FLOW" as const, text: b.text, flow_id: b.flowId ?? "" } :
          { type: "QUICK_REPLY" as const, text: b.text }
        ),
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success(`Plantilla "${res.name}" enviada a Meta (${res.status}).`, { duration: 8000 });
        reset();
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <ol className="flex flex-wrap gap-2 text-xs">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`rounded-full px-3 py-1 ${
                i === stepIdx ? "bg-primary text-primary-foreground" : i < stepIdx ? "bg-muted text-foreground" : "bg-muted/40 text-muted-foreground"
              }`}
            >
              {i + 1}. {STEP_LABEL[s]}
            </li>
          ))}
        </ol>

        <Card>
          <CardContent className="space-y-4 pt-6">
            {current === "type" && <StepType draft={draft} update={update} />}
            {current === "datos" && <StepDatos draft={draft} update={update} />}
            {current === "contenido" && <StepContenido draft={draft} update={update} uploading={uploading} setUploading={setUploading} />}
            {current === "botones" && <StepBotones draft={draft} update={update} flows={flows} />}
            {current === "tarjetas" && <StepTarjetas draft={draft} update={update} />}
            {current === "revisar" && <StepRevisar draft={draft} />}

            {stepErrors(current).length > 0 && current !== "type" && (
              <ul className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                {stepErrors(current).map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Link href="/plantillas" className="text-sm text-muted-foreground hover:underline">
            Cancelar
          </Link>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => i - 1)}>
              ← Atrás
            </Button>
            {current === "revisar" ? (
              <Button type="button" size="lg" disabled={pending} onClick={submit}>
                {pending ? "Enviando a Meta…" : "Enviar a aprobación"}
              </Button>
            ) : (
              <Button type="button" disabled={!canAdvance} onClick={() => setStepIdx((i) => i + 1)}>
                Siguiente →
              </Button>
            )}
          </div>
        </div>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Vista previa</CardTitle>
          </CardHeader>
          <CardContent>
            <LivePreview draft={draft} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function listExamples(draft: TemplateDraft): string[] {
  return listBodyVariableIndices(draft.bodyText).map((i: number) => draft.bodyExample[i] ?? "");
}
