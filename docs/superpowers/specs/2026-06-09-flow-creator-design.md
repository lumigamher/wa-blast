# Flow Creator (wa-blast) — Design Spec

**Date:** 2026-06-09
**Frente:** C1 (Flow creation) — sub-project C of the cross-app roadmap.
**App:** wa-blast (lead; clonai-blast port later)
**Status:** Autonomous design (Luis: "sigue en orden hasta terminar todo").

## Context

WhatsApp **Flows** are interactive multi-screen forms inside WhatsApp. Luis wants
**dynamic Flow creation** for **lead capture/qualification**, and proposed two input
modes: (1) a **raw Flow JSON editor** (like Meta's own Flow Builder text field), and
(2) an **"AI generator" button** — the user describes the form in natural language and
a Claude model generates the Flow JSON. Both feed the same create-and-publish path.

wa-blast already talks to the Meta Graph API directly (`src/lib/meta/graph.ts`) and has
per-org WABA creds. This adds Flow CRUD + AI generation. **Sending** flows (C2) and
**receiving responses** (C3) are separate sub-projects.

## Goals

- A `/flows/nueva` page with a **raw Flow JSON editor** + name + category, and a
  **"Generar con IA"** action that fills the editor from a natural-language request.
- **Create + publish** the Flow to Meta (Meta validates the JSON on publish; errors
  surfaced to the user).
- A `/flows` list page showing the org's existing Flows (id, name, status, categories).
- Lead-capture–oriented: default category `LEAD_GENERATION`; the AI prompt is tuned for
  static lead-capture forms (no `data_api_version`/endpoint — fully self-contained Flows).

## Non-goals (YAGNI)

- Sending Flows to contacts (C2) and receiving submitted lead data (C3).
- A drag-and-drop visual builder (the raw editor + AI generator cover "dynamic creation").
- Dynamic data-exchange Flows (endpoint_uri / data_api_version) — out of scope; we
  generate **static** Flows that `complete` and return the collected fields.
- clonai-blast port (later).

## Meta Flows API (verified)

- **Create:** `POST /{wabaId}/flows` — body `{ name, categories: ["LEAD_GENERATION"],
  flow_json: "<stringified JSON>", publish: false }`. `flow_json` and `publish` accepted
  at creation. (For lead capture we do NOT set `endpoint_uri`.)
- **Publish:** `POST /{flowId}` with `{ status: "PUBLISHED" }` (Meta validates the JSON;
  invalid → error). Alternatively `publish: true` on create.
- **List:** `GET /{wabaId}/flows?fields=id,name,status,categories`.
- Graph API v22.0 (wa-blast's current version in graph.ts).

## Architecture / pieces

1. **`src/lib/meta/flows.ts`** — Flow API client using the existing `request`/`GraphCreds`
   pattern from `graph.ts`:
   - `createFlow(creds, { name, categories, flowJson })` → `{ id }` (create as DRAFT with
     flow_json).
   - `publishFlow(creds, flowId)` → `POST /{flowId}` `{ status: "PUBLISHED" }`.
   - `listFlows(creds)` → `Flow[]` (`{ id, name, status, categories }`).
   - `createAndPublishFlow(creds, input)` → create then publish; returns `{ id, status }`;
     a publish error still leaves the DRAFT (report it).

2. **`src/lib/flow-ai.ts`** — AI generation via `@anthropic-ai/sdk`:
   - `generateFlowJson(request: string): Promise<string>` — one `messages.create` call,
     model `claude-opus-4-8`, `thinking: { type: "adaptive" }`, a **prompt-cached** system
     prompt teaching the WhatsApp Flow JSON schema (v6.3 screens/layout/form components:
     TextInput, TextArea, Dropdown, RadioButtonsGroup, CheckboxGroup, DatePicker, Footer
     with a `complete` action on the terminal screen) + lead-capture guidance + "return
     ONLY the JSON, no prose". Parse the response; if `JSON.parse` fails, one retry with a
     "your previous output was not valid JSON" nudge. Returns the pretty-printed JSON string.
   - Flow JSON is recursive (screens→layout→children) → structured-output schemas don't fit;
     we validate by `JSON.parse` + a light shape check (`version`, `screens` array) and let
     Meta do the authoritative validation on publish.

3. **`src/lib/env.ts`** — add `ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-")`.

4. **`src/app/(app)/flows/nueva/`**:
   - `page.tsx` (server, creds gate) → renders the client `flow-form.tsx`.
   - `flow-form.tsx` (client): name input, category select (LEAD_GENERATION default + the
     8 Meta categories), a big monospace **JSON editor** (textarea), a collapsible "Generar
     con IA" panel (request textarea + button → calls `generateFlowAction`, fills the editor,
     shows a spinner), live `JSON.parse` validity indicator, and "Crear y publicar" → calls
     `createFlowAction`.
   - `actions.ts`: `generateFlowAction(request)` → `{ ok, flowJson }` (calls `generateFlowJson`);
     `createFlowAction({ name, category, flowJson })` → validates JSON parses → `createAndPublishFlow`
     → `{ ok, id, status }` or `{ ok:false, error }`.

5. **`src/app/(app)/flows/page.tsx`** — list the org's flows (`listFlows`), with a "Nueva" CTA
   and a link/badge per flow (status). Add a "Flows" entry to the app nav.

## Data flow

Create: user writes/【generates】 Flow JSON → "Crear y publicar" → `createFlowAction` parses +
`createAndPublishFlow(creds, {name, [category], flowJson})` → Meta create (DRAFT) → publish →
toast with flow id + status; Meta validation errors surfaced verbatim. AI: request → Claude →
JSON string → editor (editable before submit).

## Error handling

- AI generation: SDK errors (`Anthropic.APIError`) → `{ ok:false, error }` toast; one
  JSON-parse retry; if still invalid, return the raw text so the user can fix it in the editor.
- Create/publish: `MetaApiError` → surfaced (Meta's JSON-validation message is the most
  useful signal). A failed publish leaves a DRAFT flow — the toast says so.
- Editor: live `JSON.parse` gate disables "Crear" until the JSON parses.

## Testing

- **Unit (Vitest):** `flow-ai.ts` JSON-extraction/retry logic with a mocked Anthropic client
  (no network) — given a fenced/prose-wrapped response, it extracts valid JSON; given junk
  then valid, it retries. `flows.ts` payload shaping (create body has `flow_json` stringified
  + `categories`) with mocked `fetch`.
- Manual smoke: generate a lead-capture flow via AI, tweak in the editor, publish; confirm it
  appears in `/flows` and in Meta's Flow list.
- Keep the gate green (lint, typecheck, the existing tests + new ones).

## Risks / open points

- **ANTHROPIC_API_KEY** must be set per deploy (server-side only; never exposed to client —
  generation runs in a server action).
- **Flow JSON version drift** — Meta bumps the Flow JSON version periodically; the system
  prompt pins a current version but Meta validates on publish, so a wrong version surfaces as
  a clear publish error (acceptable; the user can edit the `version` field in the editor).
- **AI cost** — one Opus call per generation; system prompt is prompt-cached so repeat
  generations are cheap. Acceptable for a low-frequency authoring action.
- **Publish vs review** — basic lead-capture Flows publish directly (Meta validates JSON).
  No template-style human approval queue applies.
