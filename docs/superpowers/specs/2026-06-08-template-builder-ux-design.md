# Template Builder UX Redesign — Design Spec

**Date:** 2026-06-08
**Frente:** A (of A·Builder UX / B·Carousel→clonai-blast / C·Flows)
**Apps:** wa-blast (lead) + clonai-blast (port)
**Status:** Approved for planning

## Context

Both wa-blast (`~/Documents/wa-blast`, standalone, Better Auth, direct Meta) and
clonai-blast (`~/Documents/clonai-blast`, Chatwoot-connected, iron-session) share a
common ancestor (funes-blast) and a near-identical template-creation form
(`src/app/(app)/plantillas/nueva/form.tsx`, ~664 lines in wa-blast). The current
builder is a single long form: name + language + category + header + body + footer +
buttons + a small preview. It works but is dense and unclear.

The end users are **non-technical commercial staff**, not developers. Two concrete
complaints drive this redesign:
1. The form is not clear / overwhelming (one long page).
2. The **language dropdown shows raw codes (`es_CO`, `en_US`)** that users don't
   understand.
3. The **template name** must be Meta-legal snake_case (`^[a-z0-9_]+$`) but users
   type free text and get rejected.

This redesign replaces the form with a **guided two-pane wizard** with a large live
WhatsApp preview, an integrated type selector, inline Meta guidance, live validation,
live snake_case name normalization, and a friendly flag+name language picker.

## Goals

- Replace the single long form with a **two-pane wizard**: steps on the left, a large
  **sticky live WhatsApp preview** on the right (preview moves to a collapsible top
  panel on mobile).
- **Type selector** as step ①: Estándar and Carrusel active; Flow and Auth/OTP shown
  as disabled "Próximamente" cards (architected to plug in later).
- **Name field**: live normalization to Meta snake_case as the user types.
- **Language picker**: flag + readable native name, never the raw code.
- **Inline guidance + live validation**: Meta rules explained in context; the
  "Enviar a aprobación" button enables only when the draft is valid.
- Apply the design to **both apps** — implement in wa-blast first, then port to
  clonai-blast.

## Non-goals (YAGNI)

- Flows (frente C) — only a disabled placeholder card in the type selector.
- Auth/OTP templates — disabled placeholder card only.
- Carousel direct-Meta sending in clonai-blast (frente B).
- Batch multi-language creation — the language complaint was only about the codes,
  not about authoring many languages at once.
- Backend changes — the wizard reuses the existing `createTemplateAction` /
  `createCarouselTemplateAction`; the Meta Graph layer is untouched.

## Architecture

A `TemplateWizard` orchestrator owns a single `TemplateDraft` state object and renders
a two-pane layout. The left pane shows the current step; the right pane shows a live
preview derived from the draft. Steps are computed from the chosen template type.

```
src/app/(app)/plantillas/nueva/
  page.tsx                      (server: gate + render wizard)
  template-wizard.tsx           (orchestrator: step state, draft, two-pane layout)
  use-template-draft.ts         (draft state + per-step validation, returns {draft, set, errors, canAdvance})
  live-preview.tsx              (right pane: WhatsAppBubble | CarouselPreview in a chat frame)
  steps/
    step-type.tsx               (① type selector cards)
    step-datos.tsx              (② name + language + category)
    step-contenido.tsx          (③ standard: header + body + footer)
    step-botones.tsx            (④ standard: buttons)
    step-tarjetas.tsx           (③ carousel: wraps existing CarouselBuilder)
    step-revisar.tsx            (⑤/④ review + submit)
  carousel-builder.tsx          (EXISTS — reused as carousel content)
src/lib/template-name.ts        (normalizeTemplateName — pure, TDD)
src/lib/languages.ts            (LANGUAGES: { code, flag, nativeName, label })
```

### Step flow (adaptive by type)
- **Estándar:** ① Tipo → ② Datos → ③ Contenido → ④ Botones → ⑤ Revisar
- **Carrusel:** ① Tipo → ② Datos → ③ Tarjetas → ④ Revisar

The wizard derives the step list from `draft.type`. Each step exposes a validation
predicate; the "Siguiente" button is disabled until the current step is valid.

### TemplateDraft (shared state)
```ts
type TemplateDraft = {
  type: "standard" | "carousel";          // (flow/auth not selectable yet)
  name: string;                            // already normalized snake_case
  language: string;                        // code e.g. "es_CO" (internal)
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  // standard:
  header?: { format: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"; text?: string; handle?: string; example?: string[] };
  body: { text: string; example: string[] };
  footer?: { text: string };
  buttons: ButtonDraft[];
  // carousel:
  carousel?: CarouselValue;                // from carousel-builder.tsx
};
```

## Key pieces

### `normalizeTemplateName(input)` — pure, TDD
Lowercases, strips diacritics (`NFD` + remove combining marks → `día`→`dia`), replaces
runs of spaces/hyphens/invalid chars with `_`, removes any remaining non-`[a-z0-9_]`,
collapses multiple `_`, trims leading/trailing `_`. The Datos step shows the live
result ("Meta verá: `promo_oro_dia`"). Empty / too-short (<2 chars after normalize) is
flagged. Name cannot change after creation → inline warning.

### Friendly language picker (`src/lib/languages.ts`)
`LANGUAGES = [{ code: "es_CO", flag: "🇨🇴", nativeName: "Español (Colombia)" }, …]`.
The select renders `flag + nativeName`; the raw `code` is never shown to the user but is
what goes to Meta. Keep the current 5 languages (es_CO, es_ES, es_MX, en_US, pt_BR) plus
room to extend.

### Inline guidance + validation
Per field: a short contextual hint (character limit, what `{{1}}` means, why examples
are required, category meaning). Live validation surfaces errors next to the field; the
final submit is gated on a fully valid draft. Validation rules live in
`use-template-draft.ts` so steps and the submit share one source of truth.

### Live preview pane (`live-preview.tsx`)
Wraps the existing `WhatsAppBubble` (standard) and `CarouselPreview` (carousel) in a
chat-style frame, fed from `TemplateDraft`. Sticky on desktop (right column);
collapsible top panel on mobile. Updates on every keystroke.

### Type selector (`step-type.tsx`)
Cards with a small visual example: **Estándar**, **Carrusel** (active); **Flow**,
**Auth/OTP** (disabled, "Próximamente" badge). Selecting a type sets `draft.type` and
recomputes the step list.

## Both apps

The design is shared. Implement in **wa-blast first** (clean, full context), then
**port to clonai-blast**. Differences to handle in the port:
- Auth: clonai-blast uses iron-session (not Better Auth) — the wizard is auth-agnostic
  (a client component); only the page-level gate differs.
- clonai-blast's `src/lib/meta.ts` already creates templates via the same Graph API
  pattern; the submit action maps the same way.
- clonai-blast gets the carousel BUILDER (creation works there via Meta directly);
  carousel SENDING in clonai-blast is frente B (out of scope here).
Each app gets its own implementation plan.

## Testing

- **TDD:** `normalizeTemplateName()` — diacritics, spaces, hyphens, symbols, multiple
  underscores, leading/trailing underscores, empty, too-short, already-valid.
- **Unit:** per-step validation predicates in `use-template-draft.ts` (valid/invalid
  drafts per step).
- Steps and preview are presentational → manual smoke (`bun run dev`): create a
  standard and a carousel template end-to-end, confirm snake_case normalization, the
  flag language picker, live preview, and that submit reaches the existing action.
- Keep the gate green (lint, typecheck, tests).

## Risks / open points

- **form.tsx is large and shared-by-lineage** — the redesign replaces it with focused
  step files; the existing `createTemplateAction`/`createCarouselTemplateAction` stay.
- **Preview fidelity** — the preview is an approximation, not a Meta-exact render; good
  enough to guide users. Document this.
- **Port drift** — wa-blast and clonai-blast forms have already diverged slightly; the
  port re-implements rather than sharing a package (the two projects stay separate).
