# wa-blast · Carousel Templates — Design Spec

**Date:** 2026-06-07
**Sub-project:** B (of A·Embedded Signup / B·Carousel / C·Flows)
**Status:** Approved for planning

## Context

wa-blast is a standalone, multi-tenant WhatsApp blast platform (Next 16 + Bun +
Better Auth + Meta Cloud API direct + Drizzle/SQLite). It is being grown into a
**multi-tenant SaaS**. For now onboarding is **manual**: the operator integrates
each client **with that client's own Meta App** (their own `app_id`/`app_secret`/
system-user token). Embedded Signup (sub-project A) will later automate this. The
multi-org foundation already exists (per-org encrypted settings + webhook routing
by `phone_number_id`).

Today the template/send pipeline supports only flat templates: `buildComponents()`
in `src/lib/meta/graph.ts` handles `HEADER`/`BODY`/`FOOTER`/`BUTTONS` (URL +
QUICK_REPLY); the sender worker (`src/lib/campaigns/worker.ts:33-41`) hard-wires a
single `body` component from positional params (`Object.values(params)`).

This spec adds **Meta carousel templates** end-to-end: create → submit for approval
→ send (blast) → preview, with full per-contact variable mapping.

## Goals

- Create carousel templates from the builder (`/plantillas/nueva`) and submit them
  to Meta for approval.
- Send carousel templates as blasts with **full variable mapping**: every variable
  (top body + each card body + button URL suffix) maps to a contact field or a
  literal. Card media is static (same for all recipients).
- Preview the carousel in the send wizard (WhatsApp-style swipeable cards).
- Host card media inside wa-blast (upload → served at a public URL Meta can fetch).
- Lay the architectural foundation (generic `ComponentPlan`) that sub-project C
  (Flows) plugs into without another rewrite.

## Non-goals (YAGNI)

- Embedded Signup (sub-project A) — onboarding stays manual.
- WhatsApp Flows (sub-project C) — `ComponentPlan` leaves the seam, no impl here.
- Other template types: LTO, authentication/OTP, copy-code, catalog, coupon.
- A/B testing of templates.

## Meta API reference (carousel shape)

**Create** (`POST /{wabaId}/message_templates`):
```jsonc
"components": [
  { "type": "BODY", "text": "Hola {{1}}, mira esto", "example": { "body_text": [["Juan"]] } },
  { "type": "CAROUSEL", "cards": [
      { "components": [
          { "type": "HEADER", "format": "IMAGE", "example": { "header_handle": ["<handle>"] } },
          { "type": "BODY", "text": "{{1}} desde {{2}}", "example": { "body_text": [["Anillo","$120"]] } },
          { "type": "BUTTONS", "buttons": [
              { "type": "URL", "text": "Ver", "url": "https://shop.co/{{1}}", "example": ["p/123"] },
              { "type": "QUICK_REPLY", "text": "Me interesa" } ] } ] },
      /* ...2–10 cards... */ ] }
]
```
Constraints (enforced by builder validation):
- 2–10 cards.
- All cards use the **same header format** (all IMAGE or all VIDEO).
- All cards use the **same button structure** (same count, same types, same order).
- Card body ≤ 160 chars; carousel category is **MARKETING** (default for this feature).

**Send** (`POST /{phoneId}/messages`, lowercase component verbs):
```jsonc
"template": {
  "name": "...", "language": { "code": "es" },
  "components": [
    { "type": "body", "parameters": [ { "type": "text", "text": "Juan" } ] },
    { "type": "carousel", "cards": [
        { "card_index": 0, "components": [
            { "type": "header", "parameters": [ { "type": "image", "image": { "link": "https://wa-blast/media/abc" } } ] },
            { "type": "body", "parameters": [ { "type": "text", "text": "Anillo" }, { "type": "text", "text": "$120" } ] },
            { "type": "button", "sub_type": "url", "index": "0", "parameters": [ { "type": "text", "text": "p/123" } ] } ] },
        /* ... */ ] }
  ]
}
```
Notes: card header media is supplied **at send** via public `link` (or media id) —
the template only stores an example handle. Button `button` components are only
included for **dynamic** URL buttons (static buttons need no send-time params).

## Architecture — generic ComponentPlan (Approach 1)

The send path is refactored so **every** template type produces a campaign-level
`ComponentPlan` (static parts) plus per-recipient variable values; a single pure
function renders the Meta payload.

```ts
// src/lib/campaigns/component-plan.ts
export type ComponentPlan =
  | { kind: "standard"; header?: StandardHeader; bodyVarKeys: string[] }
  | { kind: "carousel";
      bodyVarKeys: string[];                          // e.g. ["body.1"]
      cards: Array<{
        headerFormat: "IMAGE" | "VIDEO";
        headerLink: string;                           // static, public URL
        bodyVarKeys: string[];                        // e.g. ["card.0.body.1"]
        buttons: Array<{ type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER";
                         dynamicUrlSuffixKey?: string }>; // e.g. "card.0.button.0.url"
      }>;
    };

// pure, TDD'd
export function buildSendComponents(
  plan: ComponentPlan,
  vars: Record<string, string>,
): MetaComponent[];
```

- **Var keys are namespaced strings** (`body.1`, `card.0.body.1`,
  `card.1.button.0.url`) so per-recipient resolved values fit the existing
  `campaign_recipients.params` JSON column unchanged in shape.
- `worker.ts` stops hand-building components and calls `buildSendComponents(plan, JSON.parse(rec.params))`.
- The `plan` is stored once per campaign (`campaigns.componentPlanJson`).

## Data model (Drizzle migrations)

- **`campaigns`**: add
  - `templateType text not null default 'standard'`
  - `componentPlanJson text` (nullable; holds `ComponentPlan`)
  - Existing `headerType`/`headerHandle` retained for standard templates.
- **`media_assets`** (new): `{ id text pk, orgId text fk, kind text("image"|"video"),
  mime text, path text, bytes integer, createdAt }`.
- **`template_card_media`** (new): `{ orgId, templateName, language, cardIndex integer,
  assetId text fk }`, PK `(orgId, templateName, language, cardIndex)`. Bridges a
  created carousel template to its local media so the send wizard auto-prefills links.
- **`organization_settings`**: add `metaAppId text` (move `app_id` from
  `process.env.META_APP_ID` to per-org; `credsFromSettings` reads it). SaaS prep so
  each client uses their own Meta App.

## Meta layer changes (`src/lib/meta/`)

- **`types.ts`**: extend `WhatsAppTemplateComponent` with `type:"CAROUSEL"` + `cards`;
  extend `CreateTemplateInput` with optional `carousel: { cards: CardInput[] }`.
- **`graph.ts`** `buildComponents()`: emit `CAROUSEL` cards from `CreateTemplateInput`;
  validate 2–10 cards + uniform header format + uniform button structure (throw on
  violation with a clear message).
- **`carousel.ts`** (new): `parseCarousel(template)` → detect a carousel template from
  Meta components and extract `{ topBodyVars, cards: [{ headerFormat, bodyVars,
  buttons }] }` for the send wizard. `isCarousel(template)` helper.
- **`client.ts`** `sendTemplate`: unchanged (already forwards generic `components`).

## Media hosting (upload + serve)

- **Upload** — extend `/api/meta/upload-media` (or a sibling route): write bytes to
  `MEDIA_DIR` (env, default `.data/media/`), insert `media_assets`, and — when used
  for template creation — also push bytes to Meta resumable upload (`uploadMedia` in
  `graph.ts`) to obtain the `header_handle` example. Returns
  `{ assetId, publicUrl, metaHandle? }`. Mime whitelist (image/jpeg, image/png,
  video/mp4) + size limits (reuse `MEDIA_LIMITS`).
- **Serve** — new `app/media/[id]/route.ts`: stream the file with its content-type.
  **Public, unauthenticated** (Meta must fetch it). Random opaque id; only serves
  rows in `media_assets`; sets `Cache-Control` for CDN-friendliness.
- `MEDIA_DIR` must persist across deploys (same gotcha pattern as other projects:
  keep out of the build dir; back up/restore on deploy). Document in plan.

## Builder UI (`/plantillas/nueva`)

- Add a template-type toggle: **Estándar | Carrusel**.
- Carousel mode:
  - Top body text input (live variable detection `{{n}}` + example inputs).
  - Cards repeater (2–10): per card → media upload (image/video), body text (+ vars,
    ≤160 chars), buttons (1–2; QUICK_REPLY / URL / PHONE_NUMBER).
  - Live validation: all cards same header format + same button structure; block
    submit with inline errors otherwise.
  - Submit → `createTemplate(creds, input)` with `carousel` → on success, persist
    `template_card_media` rows (cardIndex → assetId).

## Send wizard (`/campanas/nueva`)

- When the selected template is a carousel (`isCarousel`):
  - `parseCarousel` yields all variable slots. Render the **full mapping UI**: each
    slot (top body, per-card body, per-card dynamic URL suffix) → pick a contact
    field or type a literal.
  - Card media: prefilled from `template_card_media` public URLs (editable / re-upload).
  - On create: build the `ComponentPlan` (static: card `headerLink`s + literal vars;
    `bodyVarKeys`/`dynamicUrlSuffixKey`s for mapped vars), store in
    `campaigns.componentPlanJson` + `templateType='carousel'`. Resolve each
    recipient's mapped vars into `campaign_recipients.params` (namespaced keys).
- `createCampaign` (`src/lib/campaigns/create.ts`) extended to accept and persist the
  plan; recipient param resolution reuses the existing mapping mechanism.

## Preview

- In the send wizard, render a WhatsApp-style swipeable carousel: top body bubble +
  card stack (image/video thumb + body + buttons) using the example/first-recipient
  resolved values. Pure presentational component; no Meta call.

## Worker changes (`src/lib/campaigns/worker.ts`)

- Load `camp.componentPlanJson` → `ComponentPlan` (fallback: synthesize a `standard`
  plan from `templateName` + recipient params for legacy campaigns, preserving
  current behavior).
- Replace the hand-built `components` block with
  `buildSendComponents(plan, JSON.parse(rec.params))`.

## Testing (TDD)

- **Unit (core):** `buildSendComponents()` — standard body; carousel multi-card;
  dynamic URL button; missing-var fallback; no-vars case.
- **Unit:** `parseCarousel()` + builder validation (2–10 cards, uniform format/buttons,
  body length).
- **Integration:** `createCampaign` with a carousel plan → worker produces the exact
  Meta send payload (Meta mocked); legacy standard campaign still works.
- Keep the gate green: typecheck, lint, existing 34 tests + new ones.

## Risks / open points

- **Media persistence across deploys** — `MEDIA_DIR` must survive builds/restarts
  (documented gotcha). Plan includes deploy notes.
- **Template media example vs send link** — we store both (Meta handle for the
  example, local link for sending); `template_card_media` is the durable bridge since
  template definitions live in Meta, not our DB.
- **Per-org `metaAppId`** — small migration; `uploadMedia` now needs the org's app id
  (was `process.env`). Verify the manual-onboarding flow sets it.
