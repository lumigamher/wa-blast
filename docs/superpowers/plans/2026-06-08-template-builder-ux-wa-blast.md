# Template Builder UX Redesign — wa-blast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace wa-blast's single long template-creation form with a guided two-pane wizard (steps left, sticky live WhatsApp preview right), an integrated type selector, live snake_case name normalization, a friendly flag+name language picker, and inline Meta guidance + validation.

**Architecture:** A `TemplateWizard` client orchestrator holds one `TemplateDraft` state and renders a two-pane layout. The left pane shows the current step (computed from `draft.type`); the right pane shows a live preview from the draft. Pure helpers (`normalizeTemplateName`, per-step validators) are TDD'd. The existing header/body/footer/buttons field UI is moved into step components; the existing `createTemplateAction` / `createCarouselTemplateAction` and the Meta layer are untouched.

**Tech Stack:** Next 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-template-builder-ux-design.md`

---

## File Structure

**New**
- `src/lib/template-name.ts` — `normalizeTemplateName()` (pure, TDD).
- `src/lib/languages.ts` — `LANGUAGES` data (code, flag, nativeName).
- `src/lib/template-validation.ts` — pure per-step validators (TDD).
- `src/app/(app)/plantillas/nueva/template-wizard.tsx` — orchestrator (state, step list, two-pane, nav).
- `src/app/(app)/plantillas/nueva/live-preview.tsx` — right-pane preview (wraps `WhatsAppBubble` / `CarouselPreview`).
- `src/app/(app)/plantillas/nueva/steps/step-type.tsx`
- `src/app/(app)/plantillas/nueva/steps/step-datos.tsx`
- `src/app/(app)/plantillas/nueva/steps/step-contenido.tsx`
- `src/app/(app)/plantillas/nueva/steps/step-botones.tsx`
- `src/app/(app)/plantillas/nueva/steps/step-tarjetas.tsx`
- `src/app/(app)/plantillas/nueva/steps/step-revisar.tsx`
- Tests: `tests/unit/template-name.test.ts`, `tests/unit/template-validation.test.ts`.

**Modified**
- `src/app/(app)/plantillas/nueva/page.tsx` — render `<TemplateWizard>` instead of `<TemplateForm>`.

**Removed**
- `src/app/(app)/plantillas/nueva/form.tsx` — replaced by the wizard (its field JSX is moved into steps).

**Reused unchanged**
- `carousel-builder.tsx`, `@/components/whatsapp-bubble`, `@/components/carousel-preview`, `@/lib/template-vars` (`listBodyVariableIndices`), `actions.ts` (`createTemplateAction`, `createCarouselTemplateAction`).

---

## Shared types (defined in Task 2.1, referenced throughout)

```ts
// in template-wizard.tsx
export type ButtonState = { id: string; kind: "QUICK_REPLY" | "URL"; text: string; url: string };

export type TemplateDraft = {
  type: "standard" | "carousel";
  name: string;            // already normalized snake_case
  language: string;        // code, e.g. "es_CO"
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  // standard:
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
  // carousel:
  carousel: CarouselValue;  // from ./carousel-builder
};
```

---

# Phase 0 · Pure helpers (TDD)

### Task 0.1: `normalizeTemplateName`

**Files:** Create `src/lib/template-name.ts`; Test `tests/unit/template-name.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { normalizeTemplateName } from "@/lib/template-name";

describe("normalizeTemplateName", () => {
  test("lowercases and spaces → underscore", () => {
    expect(normalizeTemplateName("Promo Oro")).toBe("promo_oro");
  });
  test("strips diacritics", () => {
    expect(normalizeTemplateName("Promo Oro Día")).toBe("promo_oro_dia");
  });
  test("removes invalid chars", () => {
    expect(normalizeTemplateName("¡Promo! 20%@oro")).toBe("promo_20_oro");
  });
  test("hyphens → underscore", () => {
    expect(normalizeTemplateName("promo-oro-2026")).toBe("promo_oro_2026");
  });
  test("collapses repeated underscores", () => {
    expect(normalizeTemplateName("promo   oro__día")).toBe("promo_oro_dia");
  });
  test("trims leading/trailing underscores", () => {
    expect(normalizeTemplateName("  _promo oro_  ")).toBe("promo_oro");
  });
  test("already valid is unchanged", () => {
    expect(normalizeTemplateName("promo_oro_2026")).toBe("promo_oro_2026");
  });
  test("empty stays empty", () => {
    expect(normalizeTemplateName("")).toBe("");
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `bun run test -- tests/unit/template-name.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function normalizeTemplateName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")     // any run of invalid chars → single _
    .replace(/_+/g, "_")             // collapse repeated _
    .replace(/^_+|_+$/g, "");        // trim leading/trailing _
}
```

- [ ] **Step 4: Run — verify PASS** (`bun run test -- tests/unit/template-name.test.ts`, 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/template-name.ts tests/unit/template-name.test.ts
git commit -m "feat(templates): normalizeTemplateName (live snake_case for the name field)"
```

---

### Task 0.2: `LANGUAGES` data

**Files:** Create `src/lib/languages.ts`

- [ ] **Step 1: Implement**

```ts
export type Language = { code: string; flag: string; nativeName: string };

export const LANGUAGES: Language[] = [
  { code: "es_CO", flag: "🇨🇴", nativeName: "Español (Colombia)" },
  { code: "es_MX", flag: "🇲🇽", nativeName: "Español (México)" },
  { code: "es_ES", flag: "🇪🇸", nativeName: "Español (España)" },
  { code: "en_US", flag: "🇺🇸", nativeName: "English (US)" },
  { code: "pt_BR", flag: "🇧🇷", nativeName: "Português (Brasil)" },
];

export function languageLabel(code: string): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? `${l.flag} ${l.nativeName}` : code;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `bunx tsc --noEmit` → clean.

```bash
git add src/lib/languages.ts
git commit -m "feat(templates): friendly language list (flag + native name, hides raw code)"
```

---

# Phase 1 · Per-step validation (TDD)

### Task 1.1: Pure step validators

**Files:** Create `src/lib/template-validation.ts`; Test `tests/unit/template-validation.test.ts`

Validators take the relevant draft slice and return `string[]` (empty = valid). They share one source of truth with the submit gate.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { validateDatos, validateContenido, validateBotones, validateTarjetas } from "@/lib/template-validation";

describe("validateDatos", () => {
  test("requires 3+ char snake_case name", () => {
    expect(validateDatos({ name: "ab", language: "es_CO", category: "UTILITY" })).toContain("nombre");
    expect(validateDatos({ name: "promo_oro", language: "es_CO", category: "UTILITY" })).toEqual([]);
  });
});

describe("validateContenido", () => {
  test("body required", () => {
    expect(validateContenido({ headerKind: "NONE", headerText: "", headerHandle: null, bodyText: "", bodyExample: {}, uploading: false })).toContain("cuerpo");
  });
  test("every variable needs an example", () => {
    const errs = validateContenido({ headerKind: "NONE", headerText: "", headerHandle: null, bodyText: "Hola {{1}}", bodyExample: {}, uploading: false });
    expect(errs.some((e) => e.includes("{{1}}"))).toBe(true);
  });
  test("media header needs an uploaded handle", () => {
    expect(validateContenido({ headerKind: "IMAGE", headerText: "", headerHandle: null, bodyText: "ok", bodyExample: {}, uploading: false })).toContain("archivo");
  });
  test("valid body passes", () => {
    expect(validateContenido({ headerKind: "NONE", headerText: "", headerHandle: null, bodyText: "Hola {{1}}", bodyExample: { 1: "Juan" }, uploading: false })).toEqual([]);
  });
});

describe("validateBotones", () => {
  test("button needs text + URL needs https", () => {
    expect(validateBotones([{ id: "a", kind: "URL", text: "", url: "x" }]).length).toBeGreaterThan(0);
    expect(validateBotones([{ id: "a", kind: "URL", text: "Ver", url: "https://x.co" }])).toEqual([]);
  });
});

describe("validateTarjetas", () => {
  test("needs 2 cards each with media", () => {
    expect(validateTarjetas({ cards: [{ handle: "h", assetId: "a" }] } as never).length).toBeGreaterThan(0);
    expect(validateTarjetas({ cards: [{ handle: "h", assetId: "a" }, { handle: null, assetId: null }] } as never).length).toBeGreaterThan(0);
    expect(validateTarjetas({ cards: [{ handle: "h", assetId: "a" }, { handle: "h2", assetId: "a2" }] } as never)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`bun run test -- tests/unit/template-validation.test.ts`).

- [ ] **Step 3: Implement**

```ts
import { listBodyVariableIndices } from "@/lib/template-vars";
import type { CarouselValue } from "@/app/(app)/plantillas/nueva/carousel-builder";

export function validateDatos(d: { name: string; language: string; category: string }): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9_]{3,}$/.test(d.name)) errs.push("El nombre debe tener 3+ caracteres (minúsculas, números, _)");
  if (!d.language) errs.push("Elige un idioma");
  if (!d.category) errs.push("Elige una categoría");
  return errs;
}

export function validateContenido(d: {
  headerKind: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText: string;
  headerHandle: string | null;
  bodyText: string;
  bodyExample: Record<number, string>;
  uploading: boolean;
}): string[] {
  const errs: string[] = [];
  if (!d.bodyText.trim()) errs.push("El cuerpo es obligatorio");
  for (const idx of listBodyVariableIndices(d.bodyText)) {
    if (!d.bodyExample[idx]?.trim()) errs.push(`Falta ejemplo para la variable {{${idx}}}`);
  }
  if (d.headerKind === "TEXT" && !d.headerText.trim()) errs.push("El header de texto no puede estar vacío");
  if ((d.headerKind === "IMAGE" || d.headerKind === "VIDEO" || d.headerKind === "DOCUMENT") && !d.headerHandle) {
    errs.push("Sube el archivo del header (espera a que termine)");
  }
  if (d.uploading) errs.push("Espera a que termine la subida del archivo");
  return errs;
}

export function validateBotones(buttons: Array<{ id: string; kind: "QUICK_REPLY" | "URL"; text: string; url: string }>): string[] {
  const errs: string[] = [];
  for (const b of buttons) {
    if (!b.text.trim()) errs.push("Todos los botones necesitan texto");
    if (b.kind === "URL" && !/^https?:\/\/.+/.test(b.url)) errs.push("Las URLs de botón deben empezar con http(s)://");
  }
  return errs;
}

export function validateTarjetas(carousel: CarouselValue): string[] {
  const errs: string[] = [];
  if (carousel.cards.length < 2) errs.push("El carrusel necesita al menos 2 tarjetas");
  if (carousel.cards.some((c) => !c.handle || !c.assetId)) errs.push("Cada tarjeta necesita una imagen o video");
  return errs;
}
```

- [ ] **Step 4: Run — verify PASS.** Then `bunx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/template-validation.ts tests/unit/template-validation.test.ts
git commit -m "feat(templates): pure per-step validators (shared by wizard + submit gate)"
```

---

# Phase 2 · Wizard shell + steps

### Task 2.1: Orchestrator + live preview

**Files:** Create `src/app/(app)/plantillas/nueva/template-wizard.tsx`, `src/app/(app)/plantillas/nueva/live-preview.tsx`

- [ ] **Step 1: Implement `live-preview.tsx`** (extract + adapt the existing `Preview` from `form.tsx:700-782`; carousel branch uses `CarouselPreview`)

```tsx
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
    id: "__preview__", name: "preview", category: "UTILITY", language: "es_CO", status: "APPROVED",
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
  for (const idx of bodyVars) { const v = draft.bodyExample[idx]; if (v?.trim()) values[String(idx)] = v; }
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
```

- [ ] **Step 2: Implement `template-wizard.tsx`** — the orchestrator: holds `draft`, derives the step list, renders two-pane + nav, and submits via the existing actions. (Submit logic ported from `form.tsx:150-283`, now gated by the pure validators.)

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeTemplateName } from "@/lib/template-name";
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

export type ButtonState = { id: string; kind: "QUICK_REPLY" | "URL"; text: string; url: string };
export type TemplateDraft = {
  type: "standard" | "carousel";
  name: string; language: string; category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  headerKind: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText: string; headerHandle: string | null; headerFileName: string | null; headerPreviewUrl: string | null;
  bodyText: string; bodyExample: Record<number, string>;
  hasFooter: boolean; footerText: string; buttons: ButtonState[];
  carousel: CarouselValue;
};

const INITIAL: TemplateDraft = {
  type: "standard", name: "", language: "es_CO", category: "UTILITY",
  headerKind: "NONE", headerText: "", headerHandle: null, headerFileName: null, headerPreviewUrl: null,
  bodyText: "", bodyExample: {}, hasFooter: false, footerText: "", buttons: [],
  carousel: { cards: [emptyCard(), emptyCard()] },
};

type StepId = "type" | "datos" | "contenido" | "botones" | "tarjetas" | "revisar";
const STEP_LABEL: Record<StepId, string> = {
  type: "Tipo", datos: "Datos", contenido: "Contenido", botones: "Botones", tarjetas: "Tarjetas", revisar: "Revisar",
};

export function TemplateWizard() {
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

  function reset() { setDraft(INITIAL); setStepIdx(0); }

  function submit() {
    const blocking = steps.flatMap(stepErrors);
    if (blocking.length > 0) { toast.error(blocking[0]); return; }
    if (draft.type === "carousel") {
      startTransition(async () => {
        const res = await createCarouselTemplateAction({
          name: draft.name, language: draft.language, category: draft.category as "MARKETING" | "UTILITY",
          body: draft.bodyText, bodyExample: "",
          cards: draft.carousel.cards.map((c) => ({ headerFormat: c.headerFormat, handle: c.handle!, assetId: c.assetId!, body: c.body, bodyExample: c.bodyExample, buttons: c.buttons })),
        });
        if (!res.ok) return toast.error(res.error);
        toast.success(`Plantilla carrusel "${res.name}" enviada a Meta (${res.status}).`, { duration: 8000 });
        reset();
      });
      return;
    }
    startTransition(async () => {
      const res = await createTemplateAction({
        name: draft.name, language: draft.language, category: draft.category,
        headerType: draft.headerKind, headerText: draft.headerKind === "TEXT" ? draft.headerText.trim() : null,
        headerHandle: draft.headerHandle ?? null, bodyText: draft.bodyText,
        bodyExample: listExamples(draft), footerText: draft.hasFooter ? draft.footerText.trim() : null,
        buttons: draft.buttons.map((b) => (b.kind === "URL" ? { type: "URL" as const, text: b.text, url: b.url } : { type: "QUICK_REPLY" as const, text: b.text })),
      });
      if (!res.ok) return toast.error(res.error);
      toast.success(`Plantilla "${res.name}" enviada a Meta (${res.status}).`, { duration: 8000 });
      reset();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <ol className="flex flex-wrap gap-2 text-xs">
          {steps.map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1 ${i === stepIdx ? "bg-primary text-primary-foreground" : i < stepIdx ? "bg-muted text-foreground" : "bg-muted/40 text-muted-foreground"}`}>
              {i + 1}. {STEP_LABEL[s]}
            </li>
          ))}
        </ol>

        <Card>
          <CardContent className="space-y-4 pt-6">
            {current === "type" && <StepType draft={draft} update={update} />}
            {current === "datos" && <StepDatos draft={draft} update={update} />}
            {current === "contenido" && <StepContenido draft={draft} update={update} uploading={uploading} setUploading={setUploading} />}
            {current === "botones" && <StepBotones draft={draft} update={update} />}
            {current === "tarjetas" && <StepTarjetas draft={draft} update={update} />}
            {current === "revisar" && <StepRevisar draft={draft} />}

            {stepErrors(current).length > 0 && current !== "type" && (
              <ul className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                {stepErrors(current).map((e) => <li key={e}>• {e}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Link href="/plantillas" className="text-sm text-muted-foreground hover:underline">Cancelar</Link>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => i - 1)}>← Atrás</Button>
            {current === "revisar" ? (
              <Button type="button" size="lg" disabled={pending} onClick={submit}>{pending ? "Enviando a Meta…" : "Enviar a aprobación"}</Button>
            ) : (
              <Button type="button" disabled={!canAdvance} onClick={() => setStepIdx((i) => i + 1)}>Siguiente →</Button>
            )}
          </div>
        </div>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Vista previa</CardTitle></CardHeader>
          <CardContent><LivePreview draft={draft} /></CardContent>
        </Card>
      </aside>
    </div>
  );
}

function listExamples(draft: TemplateDraft): string[] {
  // body variable examples in index order — mirrors form.tsx:254
  return listBodyVariableIndices(draft.bodyText).map((i: number) => draft.bodyExample[i] ?? "");
}
```

Note for executor: verify the `createTemplateAction` / `createCarouselTemplateAction` payload shapes against `actions.ts` and adjust field names if they differ.

- [ ] **Step 3: Typecheck** — `bunx tsc --noEmit`. Expect errors only for the not-yet-created step components (next tasks). If other errors, fix.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/plantillas/nueva/template-wizard.tsx" "src/app/(app)/plantillas/nueva/live-preview.tsx"
git commit -m "feat(builder): TemplateWizard orchestrator + live preview pane"
```

---

### Task 2.2: Step — Type selector

**Files:** Create `src/app/(app)/plantillas/nueva/steps/step-type.tsx`

- [ ] **Step 1: Implement** (cards; standard/carousel active, flow/auth disabled "Próximamente")

```tsx
"use client";

import { LayersIcon, MessageSquareIcon, SquareStackIcon, ShieldCheckIcon } from "lucide-react";
import type { TemplateDraft } from "../template-wizard";

const TYPES = [
  { id: "standard", label: "Estándar", desc: "Texto, imagen/video, botones", Icon: MessageSquareIcon, enabled: true },
  { id: "carousel", label: "Carrusel", desc: "Tarjetas deslizables con media", Icon: SquareStackIcon, enabled: true },
  { id: "flow", label: "Flow", desc: "Formularios interactivos", Icon: LayersIcon, enabled: false },
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
```

- [ ] **Step 2: Typecheck + commit**

Run: `bunx tsc --noEmit` (errors only from remaining missing steps OK).

```bash
git add "src/app/(app)/plantillas/nueva/steps/step-type.tsx"
git commit -m "feat(builder): step 1 — template type selector"
```

---

### Task 2.3: Step — Datos (name normalization + friendly language)

**Files:** Create `src/app/(app)/plantillas/nueva/steps/step-datos.tsx`

- [ ] **Step 1: Implement**

```tsx
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
          onChange={(e) => update({ name: normalizeTemplateName(e.target.value) })}
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
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add "src/app/(app)/plantillas/nueva/steps/step-datos.tsx"
git commit -m "feat(builder): step 2 — datos with live snake_case name + flag language picker"
```

---

### Task 2.4: Steps — Contenido + Botones (port existing field UI)

**Files:** Create `src/app/(app)/plantillas/nueva/steps/step-contenido.tsx`, `.../steps/step-botones.tsx`

The field UI already exists in `form.tsx`. Port it to read/write the `draft` via `update()`.

- [ ] **Step 1: Implement `step-contenido.tsx`** — move the Header card (`form.tsx:410-503`), Body card (`form.tsx:505-555`), and Footer card (`form.tsx:557-581`) into one component. Replace each local state read with `draft.X` and each setter with `update({ X: ... })`. The async file upload (`onHeaderFile`, `clearHeaderFile` from `form.tsx:111-148`) moves here and uses `setUploading` (passed in) + `update(...)` to set `headerHandle/headerFileName/headerPreviewUrl`. Component signature:

```tsx
"use client";
// imports: useState not needed; Input, Label, Select*, Button, Checkbox from @/components/ui/*; toast from sonner; listBodyVariableIndices from @/lib/template-vars
import type { TemplateDraft } from "../template-wizard";

export function StepContenido({
  draft, update, uploading, setUploading,
}: {
  draft: TemplateDraft;
  update: (p: Partial<TemplateDraft>) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}) {
  // bodyVars = listBodyVariableIndices(draft.bodyText)
  // onHeaderFile: same as form.tsx:111-141 but setHeaderPreviewUrl→update({headerPreviewUrl}), etc.
  // Render: <h2>Contenido</h2> + the ported Header / Body / Footer field groups, reading draft.* and calling update(...)
  // ... (port form.tsx:410-581 field JSX here, rewired to draft/update) ...
}
```

Concrete rewiring rules (apply to every moved field):
- `headerKind` → `draft.headerKind`; `setHeaderKind(x)` → `update({ headerKind: x, ...(x !== "TEXT" ? { headerText: "" } : {}) })`.
- `headerText` → `draft.headerText`; setter → `update({ headerText: e.target.value })`.
- `bodyText` → `draft.bodyText`; setter → `update({ bodyText: e.target.value })`.
- `bodyExample[idx]` → `draft.bodyExample[idx]`; setter → `update({ bodyExample: { ...draft.bodyExample, [idx]: e.target.value } })`.
- `hasFooter`/`footerText` → `draft.hasFooter`/`draft.footerText`; setters → `update({...})`.
- file upload success → `update({ headerHandle: json.handle, headerFileName: file.name, headerPreviewUrl: URL.createObjectURL(file) })`; `clearHeaderFile` → `update({ headerHandle: null, headerFileName: null, headerPreviewUrl: null })` (revoke the object URL first).
- Add a one-line inline hint under the body textarea: "Usa {{1}}, {{2}}… para personalizar. Meta pide un ejemplo real de cada variable."

- [ ] **Step 2: Implement `step-botones.tsx`** — move the Buttons card (`form.tsx:583-658`) + the `addButton/updateButton/removeButton` helpers (`form.tsx:88-109`), rewired to `draft.buttons` / `update({ buttons })`. Signature: `export function StepBotones({ draft, update }: { draft: TemplateDraft; update: (p: Partial<TemplateDraft>) => void })`. Keep the limits (max 3 buttons, max 2 URL). Add a hint: "Los botones son opcionales."

- [ ] **Step 3: Typecheck** — `bunx tsc --noEmit` clean (steps tarjetas/revisar still missing → those import errors OK until 2.5).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/plantillas/nueva/steps/step-contenido.tsx" "src/app/(app)/plantillas/nueva/steps/step-botones.tsx"
git commit -m "feat(builder): steps 3-4 — contenido (header/body/footer) + botones, rewired to draft"
```

---

### Task 2.5: Steps — Tarjetas + Revisar

**Files:** Create `src/app/(app)/plantillas/nueva/steps/step-tarjetas.tsx`, `.../steps/step-revisar.tsx`

- [ ] **Step 1: Implement `step-tarjetas.tsx`** (carousel content: top body + the existing `CarouselBuilder`)

```tsx
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
```

- [ ] **Step 2: Implement `step-revisar.tsx`** (read-only summary; the wizard's submit button lives in the orchestrator)

```tsx
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
```

- [ ] **Step 3: Typecheck** — `bunx tsc --noEmit` must now be clean (all steps exist).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/plantillas/nueva/steps/step-tarjetas.tsx" "src/app/(app)/plantillas/nueva/steps/step-revisar.tsx"
git commit -m "feat(builder): steps tarjetas + revisar"
```

---

### Task 2.6: Wire page + remove old form

**Files:** Modify `src/app/(app)/plantillas/nueva/page.tsx`; Remove `src/app/(app)/plantillas/nueva/form.tsx`

- [ ] **Step 1: Swap the component in `page.tsx`**

Change the import `import { TemplateForm } from "./form";` → `import { TemplateWizard } from "./template-wizard";` and the JSX `<TemplateForm />` → `<TemplateWizard />`. Leave the surrounding gate (creds check) unchanged.

- [ ] **Step 2: Delete the old form**

```bash
git rm "src/app/(app)/plantillas/nueva/form.tsx"
```

- [ ] **Step 3: Typecheck + lint**

Run: `bunx tsc --noEmit` → clean. Run: `bun run lint` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/plantillas/nueva/page.tsx"
git commit -m "feat(builder): render TemplateWizard, remove legacy form"
```

---

# Phase 3 · Gate + smoke

### Task 3.1: Green gate + manual smoke

- [ ] **Step 1: Tests** — `bun run test` → all pass (existing 49 + new ~12).
- [ ] **Step 2: Typecheck** — `bunx tsc --noEmit` → clean.
- [ ] **Step 3: Lint** — `bun run lint` → 0 errors.
- [ ] **Step 4: Build** — `bun run build` → succeeds.
- [ ] **Step 5: Manual smoke** — `bun run dev`, go to `/plantillas/nueva`:
  - Step Tipo → pick Estándar; Datos → type "Promo Oro Día!", confirm it shows `promo_oro_dia`; language shows flags; advance through Contenido (body + a `{{1}}` example + optional image header) → Botones → Revisar → submit, expect the success toast.
  - Repeat picking Carrusel: Datos → Tarjetas (2 cards + media) → Revisar → submit.
  - Confirm the right-pane preview updates live in both flows.
- [ ] **Step 6: Final commit (if lint/format fixes)**

```bash
git add -A && git commit -m "chore: template builder UX — green gate"
```

---

## Notes for the clonai-blast port (separate plan, later)

- clonai-blast uses iron-session and its own `src/lib/meta.ts` (same `createTemplate` pattern). The wizard, steps, `template-name.ts`, `languages.ts`, and `template-validation.ts` port almost verbatim; adjust the action import + payload to clonai-blast's `actions.ts`.
- clonai-blast gets the carousel BUILDER (creation works via Meta directly); carousel SENDING there is frente B (out of scope).
- Deploy gotcha (from memory): stop the `clonai-blast` service before `next build` (SQLite lock).
