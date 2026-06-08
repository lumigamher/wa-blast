# Carousel Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Meta WhatsApp carousel templates to wa-blast end-to-end — create → submit for approval → blast with full per-contact variable mapping → preview.

**Architecture:** A generic `ComponentPlan` (stored per campaign) plus per-recipient variable values, rendered to the Meta send payload by one pure function `buildSendComponents()`. Carousel is the first non-trivial implementer; sub-project C (Flows) plugs into the same seam. Card media is uploaded into wa-blast and served at a public URL Meta can fetch. Each client uses their own Meta App (`metaAppId` moves to per-org settings).

**Tech Stack:** Next 16 (App Router) · Bun · Drizzle/SQLite · Better Auth · Meta Cloud API v22.0 · Vitest · Zod.

**Spec:** `docs/superpowers/specs/2026-06-07-carousel-templates-design.md`

---

## File Structure

**New files**
- `src/lib/campaigns/component-plan.ts` — `ComponentPlan` types + pure `buildSendComponents()`.
- `src/lib/meta/carousel.ts` — `isCarousel()` + `parseCarousel()` (read Meta template → variable slots).
- `src/lib/media/store.ts` — save/read hosted media assets + `publicMediaUrl()`.
- `src/app/media/[id]/route.ts` — public file server for hosted media.
- `src/app/(app)/plantillas/nueva/carousel-builder.tsx` — carousel form sub-component.
- `src/app/(app)/campanas/nueva/carousel-mapping.tsx` — send-time variable mapping sub-component.
- `src/components/carousel-preview.tsx` — WhatsApp-style carousel preview.
- Tests: `tests/unit/component-plan.test.ts`, `tests/unit/carousel-parse.test.ts`, `tests/unit/carousel-create.test.ts`, `tests/unit/media-store.test.ts`, `tests/integration/carousel-campaign.test.ts`.

**Modified files**
- `src/lib/db/schema/domain.ts` — new columns/tables.
- `src/lib/env.ts` — `MEDIA_DIR`.
- `src/lib/meta/types.ts` — CAROUSEL component, `CardInput`, `CreateTemplateInput.carousel`, `PHONE_NUMBER` button.
- `src/lib/meta/graph.ts` — carousel emission in `buildComponents()`, `credsFromSettings()` reads per-org appId.
- `src/lib/org/settings.ts` — `metaAppId` in read/save.
- `src/lib/campaigns/create.ts` — persist `templateType` + `componentPlanJson`.
- `src/lib/campaigns/worker.ts` — render via `buildSendComponents()` with legacy fallback.
- `src/app/api/meta/upload-media/route.ts` — also store locally, return `assetId` + `publicUrl`.
- `src/app/(app)/plantillas/nueva/form.tsx` + `actions.ts` — carousel mode + create action.
- `src/app/(app)/campanas/nueva/page.tsx` + `wizard.tsx` + `actions.ts` — carousel mapping + plan build.

---

# Phase 0 · Data model + types

### Task 0.1: Schema migration

**Files:**
- Modify: `src/lib/db/schema/domain.ts`
- Generate: `drizzle/migrations/*`

- [ ] **Step 1: Add columns to `organization_settings` and `campaigns`, add two tables**

In `src/lib/db/schema/domain.ts`, add `metaAppId` to `organizationSettings` (after `metaWabaId`):

```ts
  metaAppId: text("meta_app_id"),
```

Add to `campaigns` (after `headerHandle`):

```ts
    templateType: text("template_type").notNull().default("standard"),
    componentPlanJson: text("component_plan_json"),
```

Append two new tables at the end of the file:

```ts
export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "image" | "video"
    mime: text("mime").notNull(),
    path: text("path").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("media_assets_org_idx").on(t.orgId) }),
);

export const templateCardMedia = sqliteTable(
  "template_card_media",
  {
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    templateName: text("template_name").notNull(),
    templateLanguage: text("template_language").notNull(),
    cardIndex: integer("card_index").notNull(),
    assetId: text("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.templateName, t.templateLanguage, t.cardIndex] }),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate`
Expected: a new file under `drizzle/migrations/` adding the columns and tables; no errors.

- [ ] **Step 3: Apply + sanity check**

Run: `bun run db:migrate`
Then verify tables exist:
Run: `bun run -e "import {Database} from 'bun:sqlite'; const d=new Database('.data/wa-blast.db'); console.log(d.query(\"select name from sqlite_master where type='table' and name in ('media_assets','template_card_media')\").all())"`
Expected: both table names printed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations
git commit -m "feat(db): carousel schema — campaigns plan cols, media_assets, template_card_media, per-org metaAppId"
```

---

### Task 0.2: Extend Meta types

**Files:**
- Modify: `src/lib/meta/types.ts`

- [ ] **Step 1: Replace the file contents**

```ts
export type WhatsAppButton = {
  type: string; // QUICK_REPLY | URL | PHONE_NUMBER
  text: string;
  url?: string;
  phone_number?: string;
};

export type WhatsAppCard = {
  components: WhatsAppTemplateComponent[];
};

export type WhatsAppTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS" | "CAROUSEL";
  text?: string;
  format?: string;
  example?: { body_text?: string[][]; header_text?: string[]; header_handle?: string[] };
  buttons?: WhatsAppButton[];
  cards?: WhatsAppCard[];
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
  components: WhatsAppTemplateComponent[];
};

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type ButtonSpec =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; example?: string[] }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

export type MediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

export type HeaderSpec =
  | { type: "TEXT"; text: string; example?: string[] }
  | { type: MediaFormat; handle: string };

export type CardInput = {
  header: { format: "IMAGE" | "VIDEO"; handle: string };
  body: { text: string; example?: string[] };
  buttons: ButtonSpec[];
};

export type CreateTemplateInput = {
  name: string;
  language: string;
  category: TemplateCategory;
  header?: HeaderSpec;
  body: { text: string; example?: string[] };
  footer?: { text: string };
  buttons?: ButtonSpec[];
  carousel?: { cards: CardInput[] };
};
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean (no new errors introduced by the type changes).

- [ ] **Step 3: Commit**

```bash
git add src/lib/meta/types.ts
git commit -m "feat(meta): carousel template types (CAROUSEL component, CardInput, PHONE_NUMBER button)"
```

---

# Phase 1 · Core — `buildSendComponents()` (TDD)

### Task 1.1: ComponentPlan + standard rendering

**Files:**
- Create: `src/lib/campaigns/component-plan.ts`
- Test: `tests/unit/component-plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { buildSendComponents, type ComponentPlan } from "@/lib/campaigns/component-plan";

describe("buildSendComponents — standard", () => {
  test("body vars in order", () => {
    const plan: ComponentPlan = { kind: "standard", bodyVarKeys: ["body.1", "body.2"] };
    const out = buildSendComponents(plan, { "body.1": "Juan", "body.2": "VIP" });
    expect(out).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Juan" }, { type: "text", text: "VIP" }] },
    ]);
  });

  test("no vars → empty components", () => {
    const plan: ComponentPlan = { kind: "standard", bodyVarKeys: [] };
    expect(buildSendComponents(plan, {})).toEqual([]);
  });

  test("missing var → empty string", () => {
    const plan: ComponentPlan = { kind: "standard", bodyVarKeys: ["body.1"] };
    expect(buildSendComponents(plan, {})).toEqual([
      { type: "body", parameters: [{ type: "text", text: "" }] },
    ]);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `bun run test -- tests/unit/component-plan.test.ts`
Expected: FAIL — cannot find module `component-plan`.

- [ ] **Step 3: Implement minimal code**

```ts
export type SendParam =
  | { type: "text"; text: string }
  | { type: "image"; image: { link: string } }
  | { type: "video"; video: { link: string } };

export type SendComponent =
  | { type: "body"; parameters: SendParam[] }
  | { type: "header"; parameters: SendParam[] }
  | { type: "button"; sub_type: "url"; index: string; parameters: SendParam[] }
  | { type: "carousel"; cards: SendCard[] };

export type SendCard = { card_index: number; components: SendComponent[] };

export type CarouselCardPlan = {
  headerFormat: "IMAGE" | "VIDEO";
  headerLink: string;
  bodyVarKeys: string[];
  buttons: Array<{ type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER"; dynamicUrlSuffixKey?: string }>;
};

export type ComponentPlan =
  | { kind: "standard"; bodyVarKeys: string[] }
  | { kind: "carousel"; bodyVarKeys: string[]; cards: CarouselCardPlan[] };

function textParams(keys: string[], vars: Record<string, string>): SendParam[] {
  return keys.map((k) => ({ type: "text" as const, text: vars[k] ?? "" }));
}

export function buildSendComponents(plan: ComponentPlan, vars: Record<string, string>): SendComponent[] {
  if (plan.kind === "standard") {
    if (plan.bodyVarKeys.length === 0) return [];
    return [{ type: "body", parameters: textParams(plan.bodyVarKeys, vars) }];
  }
  // carousel handled in Task 1.2
  return [];
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `bun run test -- tests/unit/component-plan.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/component-plan.ts tests/unit/component-plan.test.ts
git commit -m "feat(campaigns): ComponentPlan + buildSendComponents (standard)"
```

---

### Task 1.2: Carousel rendering

**Files:**
- Modify: `src/lib/campaigns/component-plan.ts`
- Test: `tests/unit/component-plan.test.ts`

- [ ] **Step 1: Add failing tests**

Append inside the test file:

```ts
describe("buildSendComponents — carousel", () => {
  const plan: ComponentPlan = {
    kind: "carousel",
    bodyVarKeys: ["body.1"],
    cards: [
      {
        headerFormat: "IMAGE",
        headerLink: "https://wa/media/a",
        bodyVarKeys: ["card.0.body.1"],
        buttons: [{ type: "URL", dynamicUrlSuffixKey: "card.0.button.0.url" }, { type: "QUICK_REPLY" }],
      },
      {
        headerFormat: "IMAGE",
        headerLink: "https://wa/media/b",
        bodyVarKeys: [],
        buttons: [{ type: "URL" }, { type: "QUICK_REPLY" }],
      },
    ],
  };

  test("top body + cards + dynamic url", () => {
    const out = buildSendComponents(plan, {
      "body.1": "Juan",
      "card.0.body.1": "Anillo",
      "card.0.button.0.url": "p/123",
    });
    expect(out).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Juan" }] },
      {
        type: "carousel",
        cards: [
          {
            card_index: 0,
            components: [
              { type: "header", parameters: [{ type: "image", image: { link: "https://wa/media/a" } }] },
              { type: "body", parameters: [{ type: "text", text: "Anillo" }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "p/123" }] },
            ],
          },
          {
            card_index: 1,
            components: [
              { type: "header", parameters: [{ type: "image", image: { link: "https://wa/media/b" } }] },
            ],
          },
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run — verify the new test fails**

Run: `bun run test -- tests/unit/component-plan.test.ts`
Expected: FAIL on the carousel test (carousel branch returns `[]`).

- [ ] **Step 3: Implement the carousel branch**

Replace the `// carousel handled in Task 1.2` line and its `return []` with:

```ts
  const components: SendComponent[] = [];
  if (plan.bodyVarKeys.length > 0) {
    components.push({ type: "body", parameters: textParams(plan.bodyVarKeys, vars) });
  }
  const cards: SendCard[] = plan.cards.map((card, ci) => {
    const comps: SendComponent[] = [];
    const fmt = card.headerFormat === "IMAGE" ? "image" : "video";
    comps.push({
      type: "header",
      parameters: [
        fmt === "image"
          ? { type: "image", image: { link: card.headerLink } }
          : { type: "video", video: { link: card.headerLink } },
      ],
    });
    if (card.bodyVarKeys.length > 0) {
      comps.push({ type: "body", parameters: textParams(card.bodyVarKeys, vars) });
    }
    card.buttons.forEach((btn, bi) => {
      if (btn.dynamicUrlSuffixKey) {
        comps.push({
          type: "button",
          sub_type: "url",
          index: String(bi),
          parameters: [{ type: "text", text: vars[btn.dynamicUrlSuffixKey] ?? "" }],
        });
      }
    });
    return { card_index: ci, components: comps };
  });
  components.push({ type: "carousel", cards });
  return components;
```

- [ ] **Step 4: Run — verify all pass**

Run: `bun run test -- tests/unit/component-plan.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/component-plan.ts tests/unit/component-plan.test.ts
git commit -m "feat(campaigns): buildSendComponents carousel rendering"
```

---

# Phase 2 · Meta carousel create + parse

### Task 2.1: Carousel emission + validation in `buildComponents()`

**Files:**
- Modify: `src/lib/meta/graph.ts`
- Test: `tests/unit/carousel-create.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from "vitest";
import { buildCreateComponents, validateCarousel } from "@/lib/meta/graph";
import type { CardInput } from "@/lib/meta/types";

const card = (over: Partial<CardInput> = {}): CardInput => ({
  header: { format: "IMAGE", handle: "h1" },
  body: { text: "Card {{1}}", example: ["Anillo"] },
  buttons: [{ type: "URL", text: "Ver", url: "https://s.co/{{1}}", example: ["p/1"] }, { type: "QUICK_REPLY", text: "Info" }],
  ...over,
});

describe("validateCarousel", () => {
  test("rejects <2 cards", () => {
    expect(() => validateCarousel([card()])).toThrow(/2/);
  });
  test("rejects mixed header formats", () => {
    expect(() => validateCarousel([card(), card({ header: { format: "VIDEO", handle: "h2" } })])).toThrow(/format/i);
  });
  test("rejects different button structure", () => {
    expect(() => validateCarousel([card(), card({ buttons: [{ type: "QUICK_REPLY", text: "x" }] })])).toThrow(/button/i);
  });
  test("accepts uniform cards", () => {
    expect(() => validateCarousel([card(), card()])).not.toThrow();
  });
});

describe("buildCreateComponents carousel", () => {
  test("emits CAROUSEL with cards", () => {
    const comps = buildCreateComponents({
      name: "promo",
      language: "es",
      category: "MARKETING",
      body: { text: "Hola {{1}}", example: ["Juan"] },
      carousel: { cards: [card(), card()] },
    });
    const carousel = comps.find((c) => (c as { type: string }).type === "CAROUSEL") as {
      type: string;
      cards: Array<{ components: Array<{ type: string; format?: string }> }>;
    };
    expect(carousel.cards).toHaveLength(2);
    expect(carousel.cards[0].components[0]).toMatchObject({ type: "HEADER", format: "IMAGE" });
    expect(carousel.cards[0].components.some((c) => c.type === "BUTTONS")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `bun run test -- tests/unit/carousel-create.test.ts`
Expected: FAIL — `buildCreateComponents`/`validateCarousel` not exported.

- [ ] **Step 3: Implement**

In `src/lib/meta/graph.ts`: rename the existing private `buildComponents` to exported `buildCreateComponents`, add carousel emission + `validateCarousel`, and update its caller in `createTemplate`. Extend the existing `import type { ... } from "./types"` line to also import `CardInput` and `ButtonSpec` (the `metaButton` helper below needs `ButtonSpec`). Add this near the other exports:

```ts
// types imported via the existing "./types" import line: add CardInput, ButtonSpec

export function validateCarousel(cards: CardInput[]): void {
  if (cards.length < 2 || cards.length > 10) {
    throw new Error("El carrusel debe tener entre 2 y 10 tarjetas");
  }
  const fmt = cards[0].header.format;
  const sig = (c: CardInput) => c.buttons.map((b) => b.type).join(",");
  const sig0 = sig(cards[0]);
  for (const c of cards) {
    if (c.header.format !== fmt) throw new Error("Todas las tarjetas deben usar el mismo formato de header (IMAGE o VIDEO)");
    if (sig(c) !== sig0) throw new Error("Todas las tarjetas deben tener la misma estructura de botones");
  }
}

function buildCardComponents(card: CardInput): Array<Record<string, unknown>> {
  const comps: Array<Record<string, unknown>> = [
    { type: "HEADER", format: card.header.format, example: { header_handle: [card.header.handle] } },
  ];
  const body: Record<string, unknown> = { type: "BODY", text: card.body.text };
  if (/\{\{\d+\}\}/.test(card.body.text) && card.body.example?.length) {
    body.example = { body_text: [card.body.example] };
  }
  comps.push(body);
  if (card.buttons.length) {
    comps.push({ type: "BUTTONS", buttons: card.buttons.map(metaButton) });
  }
  return comps;
}
```

Add a shared `metaButton` helper (replace the inline `.map` in the existing BUTTONS block so both standard + carousel reuse it):

```ts
function metaButton(b: ButtonSpec): Record<string, unknown> {
  if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
  if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
  const out: Record<string, unknown> = { type: "URL", text: b.text, url: b.url };
  if (/\{\{\d+\}\}/.test(b.url) && b.example?.length) out.example = b.example;
  return out;
}
```

In `buildCreateComponents`, before `return components;`, add:

```ts
  if (input.carousel?.cards?.length) {
    validateCarousel(input.carousel.cards);
    components.push({ type: "CAROUSEL", cards: input.carousel.cards.map((c) => ({ components: buildCardComponents(c) })) });
  }
```

Update `ButtonSpec` import usage and `createTemplate` to call `buildCreateComponents(input)`.

- [ ] **Step 4: Run — verify pass**

Run: `bun run test -- tests/unit/carousel-create.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta/graph.ts tests/unit/carousel-create.test.ts
git commit -m "feat(meta): emit + validate CAROUSEL in template creation"
```

---

### Task 2.2: `parseCarousel()` + `isCarousel()`

**Files:**
- Create: `src/lib/meta/carousel.ts`
- Test: `tests/unit/carousel-parse.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, test } from "vitest";
import { isCarousel, parseCarousel } from "@/lib/meta/carousel";
import type { WhatsAppTemplate } from "@/lib/meta/types";

const tpl: WhatsAppTemplate = {
  id: "1", name: "promo", language: "es", category: "MARKETING", status: "APPROVED",
  components: [
    { type: "BODY", text: "Hola {{1}}" },
    { type: "CAROUSEL", cards: [
      { components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "{{1}} por {{2}}" },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://s.co/{{1}}" }, { type: "QUICK_REPLY", text: "Info" }] },
      ] },
      { components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Sin variables" },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://s.co/fixed" }, { type: "QUICK_REPLY", text: "Info" }] },
      ] },
    ] },
  ],
};

describe("parseCarousel", () => {
  test("isCarousel true", () => expect(isCarousel(tpl)).toBe(true));

  test("extracts slots with namespaced keys", () => {
    const p = parseCarousel(tpl);
    expect(p.topBodyVarKeys).toEqual(["body.1"]);
    expect(p.cards[0].headerFormat).toBe("IMAGE");
    expect(p.cards[0].bodyVarKeys).toEqual(["card.0.body.1", "card.0.body.2"]);
    expect(p.cards[0].buttons[0]).toEqual({ type: "URL", dynamicUrlSuffixKey: "card.0.button.0.url" });
    expect(p.cards[1].bodyVarKeys).toEqual([]);
    expect(p.cards[1].buttons[0]).toEqual({ type: "URL" });
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `bun run test -- tests/unit/carousel-parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { WhatsAppTemplate, WhatsAppTemplateComponent } from "./types";

export function isCarousel(t: WhatsAppTemplate): boolean {
  return t.components.some((c) => c.type === "CAROUSEL");
}

function varIndices(text: string | undefined): number[] {
  if (!text) return [];
  const seen = new Set<number>();
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) seen.add(Number.parseInt(m[1], 10));
  return [...seen].sort((a, b) => a - b);
}

export type ParsedCardButton = { type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER"; dynamicUrlSuffixKey?: string };
export type ParsedCard = { headerFormat: "IMAGE" | "VIDEO"; bodyVarKeys: string[]; buttons: ParsedCardButton[] };
export type ParsedCarousel = { topBodyVarKeys: string[]; cards: ParsedCard[] };

export function parseCarousel(t: WhatsAppTemplate): ParsedCarousel {
  const topBody = t.components.find((c) => c.type === "BODY");
  const carousel = t.components.find((c) => c.type === "CAROUSEL");
  const cards: ParsedCard[] = (carousel?.cards ?? []).map((card, ci) => {
    const header = card.components.find((c) => c.type === "HEADER");
    const body = card.components.find((c) => c.type === "BODY");
    const buttonsComp = card.components.find((c) => c.type === "BUTTONS");
    const bodyVarKeys = varIndices(body?.text).map((n) => `card.${ci}.body.${n}`);
    const buttons: ParsedCardButton[] = (buttonsComp?.buttons ?? []).map((b, bi) => {
      const type = b.type as ParsedCardButton["type"];
      if (type === "URL" && b.url && /\{\{\d+\}\}/.test(b.url)) {
        return { type, dynamicUrlSuffixKey: `card.${ci}.button.${bi}.url` };
      }
      return { type };
    });
    return { headerFormat: (header?.format as "IMAGE" | "VIDEO") ?? "IMAGE", bodyVarKeys, buttons };
  });
  return { topBodyVarKeys: varIndices(topBody?.text).map((n) => `body.${n}`), cards };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `bun run test -- tests/unit/carousel-parse.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta/carousel.ts tests/unit/carousel-parse.test.ts
git commit -m "feat(meta): parseCarousel + isCarousel (template → variable slots)"
```

---

# Phase 3 · Media hosting

### Task 3.1: Media store + env

**Files:**
- Modify: `src/lib/env.ts`
- Create: `src/lib/media/store.ts`
- Test: `tests/unit/media-store.test.ts`

- [ ] **Step 1: Add `MEDIA_DIR` to env**

In `src/lib/env.ts`, add inside the schema (after `DATABASE_URL`):

```ts
  MEDIA_DIR: z.string().default(".data/media"),
  PUBLIC_BASE_URL: z.string().url().optional(),
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { saveMediaAsset, getMediaAsset } from "@/lib/media/store";

async function seedOrg() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  return db;
}

describe("media store", () => {
  test("save writes file + row, get returns it", async () => {
    const db = await seedOrg();
    const dir = mkdtempSync(join(tmpdir(), "wablast-media-"));
    const bytes = new TextEncoder().encode("hello").buffer;
    const asset = await saveMediaAsset(db, { orgId: "o", bytes, mime: "image/png", dir });
    expect(asset.kind).toBe("image");
    expect(readFileSync(join(dir, asset.id)).toString()).toBe("hello");
    const got = await getMediaAsset(db, asset.id);
    expect(got?.id).toBe(asset.id);
  });
});
```

- [ ] **Step 3: Run — verify it fails**

Run: `bun run test -- tests/unit/media-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { mediaAssets } from "@/lib/db/schema";
import { env } from "@/lib/env";

export type SavedAsset = { id: string; kind: "image" | "video"; mime: string; path: string; bytes: number };

export async function saveMediaAsset(
  db: DB,
  input: { orgId: string; bytes: ArrayBuffer; mime: string; dir?: string },
): Promise<SavedAsset> {
  const dir = input.dir ?? env.MEDIA_DIR;
  mkdirSync(dir, { recursive: true });
  const id = `media_${crypto.randomUUID()}`;
  const path = join(dir, id);
  writeFileSync(path, Buffer.from(input.bytes));
  const kind: "image" | "video" = input.mime.startsWith("video/") ? "video" : "image";
  const bytes = input.bytes.byteLength;
  await db.insert(mediaAssets).values({ id, orgId: input.orgId, kind, mime: input.mime, path, bytes, createdAt: new Date() });
  return { id, kind, mime: input.mime, path, bytes };
}

export async function getMediaAsset(db: DB, id: string) {
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  return row ?? null;
}

export function publicMediaUrl(id: string): string {
  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;
  return `${base.replace(/\/$/, "")}/media/${id}`;
}
```

- [ ] **Step 5: Run — verify pass**

Run: `bun run test -- tests/unit/media-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts src/lib/media/store.ts tests/unit/media-store.test.ts
git commit -m "feat(media): hosted media asset store + publicMediaUrl"
```

---

### Task 3.2: Public serve route

**Files:**
- Create: `src/app/media/[id]/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db/client";
import { getMediaAsset } from "@/lib/media/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getMediaAsset(db, id);
  if (!asset) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(asset.path);
    return new Response(buf, {
      headers: {
        "content-type": asset.mime,
        "content-length": String(asset.bytes),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Gone", { status: 410 });
  }
}
```

- [ ] **Step 2: Manual smoke (deferred to first real upload)**

Note for executor: after Task 3.3, upload a file and `curl -I` the returned `publicUrl`; expect `200` + correct `content-type`. No automated test (filesystem + Next route).

- [ ] **Step 3: Typecheck + commit**

Run: `bunx tsc --noEmit` → clean.

```bash
git add src/app/media/[id]/route.ts
git commit -m "feat(media): public file-server route for hosted media"
```

---

### Task 3.3: Extend upload route to store locally

**Files:**
- Modify: `src/app/api/meta/upload-media/route.ts`

- [ ] **Step 1: Store the asset alongside the Meta handle**

Replace the `try { ... }` block body with:

```ts
  try {
    const bytes = await file.arrayBuffer();
    const handle = await uploadMedia(creds, bytes, { fileName: file.name, mimeType: file.type });
    const asset = await saveMediaAsset(db, { orgId, bytes, mime: file.type });
    return NextResponse.json({ ok: true, handle, format, assetId: asset.id, publicUrl: publicMediaUrl(asset.id) });
  } catch (e) {
```

Add imports at the top:

```ts
import { saveMediaAsset, publicMediaUrl } from "@/lib/media/store";
```

- [ ] **Step 2: Typecheck + commit**

Run: `bunx tsc --noEmit` → clean.

```bash
git add src/app/api/meta/upload-media/route.ts
git commit -m "feat(media): upload route also stores asset + returns publicUrl"
```

---

# Phase 4 · Per-org Meta App id

### Task 4.1: `metaAppId` in settings + creds

**Files:**
- Modify: `src/lib/org/settings.ts`, `src/lib/meta/graph.ts`
- Test: `tests/unit/org-settings.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, organizationSettings } from "@/lib/db/schema";
import { getOrgSettings, saveMetaCreds } from "@/lib/org/settings";
import { credsFromSettings } from "@/lib/meta/graph";

describe("metaAppId per-org", () => {
  test("save + read + creds use org appId", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
    await db.insert(organizationSettings).values({ orgId: "o", updatedAt: new Date() });
    await saveMetaCreds(db, "o", {
      metaPhoneId: "p", metaWabaId: "w", metaAppId: "app1",
      metaAccessToken: "tok", metaAppSecret: "sec", metaVerifyToken: "vt",
    });
    const s = await getOrgSettings(db, "o");
    expect(s.metaAppId).toBe("app1");
    expect(credsFromSettings(s)?.appId).toBe("app1");
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `bun run test -- tests/unit/org-settings.test.ts`
Expected: FAIL — `metaAppId` not on type / not saved.

- [ ] **Step 3: Implement**

In `src/lib/org/settings.ts`: add `metaAppId: string | null;` to `DecryptedSettings`; in `getOrgSettings` return `metaAppId: row.metaAppId`; extend `saveMetaCreds` input with `metaAppId: string` and `.set({ ..., metaAppId: input.metaAppId })`.

In `src/lib/meta/graph.ts` `credsFromSettings`, change the parameter type to include `metaAppId: string | null` and set:

```ts
    appId: settings.metaAppId ?? process.env.META_APP_ID,
```

- [ ] **Step 4: Run — verify pass**

Run: `bun run test -- tests/unit/org-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/org/settings.ts src/lib/meta/graph.ts tests/unit/org-settings.test.ts
git commit -m "feat(settings): per-org metaAppId (SaaS prep, manual onboarding)"
```

---

# Phase 5 · Campaign create + worker integration

### Task 5.1: Persist plan in `createCampaign`

**Files:**
- Modify: `src/lib/campaigns/create.ts`

- [ ] **Step 1: Extend input + insert**

Add to `CreateCampaignInput`:

```ts
  templateType?: "standard" | "carousel";
  componentPlanJson?: string | null;
```

In the `tx.insert(campaigns).values({...})` object add:

```ts
      templateType: input.templateType ?? "standard",
      componentPlanJson: input.componentPlanJson ?? null,
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaigns/create.ts
git commit -m "feat(campaigns): persist templateType + componentPlanJson"
```

---

### Task 5.2: Worker renders via plan (with legacy fallback)

**Files:**
- Modify: `src/lib/campaigns/worker.ts`
- Test: `tests/integration/carousel-campaign.test.ts`

- [ ] **Step 1: Write failing integration test**

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, organization, organizationSettings, user } from "@/lib/db/schema";
import { InProcessSenderWorker } from "@/lib/campaigns/worker";
import { encrypt } from "@/lib/crypto/encrypt";
import type { ComponentPlan } from "@/lib/campaigns/component-plan";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("worker carousel send", () => {
  test("builds carousel payload from plan", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
    await db.insert(organizationSettings).values({
      orgId: "o", metaPhoneId: "111", metaAccessTokenEnc: encrypt("tok"), rateLimitMps: 100, updatedAt: new Date(),
    });
    await db.insert(user).values({ id: "u", email: "u@x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    const plan: ComponentPlan = {
      kind: "carousel", bodyVarKeys: ["body.1"],
      cards: [
        { headerFormat: "IMAGE", headerLink: "https://wa/media/a", bodyVarKeys: [], buttons: [] },
        { headerFormat: "IMAGE", headerLink: "https://wa/media/b", bodyVarKeys: [], buttons: [] },
      ],
    };
    await db.insert(campaigns).values({
      id: "camp", orgId: "o", name: "T", templateName: "promo", templateLanguage: "es",
      headerType: "NONE", templateType: "carousel", componentPlanJson: JSON.stringify(plan),
      source: "adhoc", status: "queued", total: 1, createdBy: "u", createdAt: new Date(),
    });
    await db.insert(campaignRecipients).values({ campaignId: "camp", phone: "+57300", params: JSON.stringify({ "body.1": "Juan" }), status: "pending" });

    let sentBody: any = null;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }) as unknown as typeof fetch;

    await new InProcessSenderWorker(db).runCampaign("camp");

    const comps = sentBody.template.components;
    expect(comps[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "Juan" }] });
    expect(comps[1].type).toBe("carousel");
    expect(comps[1].cards).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `bun run test -- tests/integration/carousel-campaign.test.ts`
Expected: FAIL — worker ignores the plan (sends `[]` or legacy body).

- [ ] **Step 3: Implement plan rendering in worker**

In `src/lib/campaigns/worker.ts`, add import:

```ts
import { buildSendComponents, type ComponentPlan } from "./component-plan";
```

Replace the `const components = ...` block (lines ~32-41) with:

```ts
      const params = JSON.parse(rec.params) as Record<string, string>;
      let components: unknown[];
      if (camp.componentPlanJson) {
        components = buildSendComponents(JSON.parse(camp.componentPlanJson) as ComponentPlan, params);
      } else {
        components =
          Object.keys(params).length > 0
            ? [{ type: "body", parameters: Object.values(params).map((v) => ({ type: "text", text: v })) }]
            : [];
      }
```

- [ ] **Step 4: Run — verify pass + full suite**

Run: `bun run test -- tests/integration/carousel-campaign.test.ts`
Expected: PASS.
Run: `bun run test`
Expected: all pass (existing 34 + new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/worker.ts tests/integration/carousel-campaign.test.ts
git commit -m "feat(campaigns): worker renders components via plan (legacy fallback)"
```

---

# Phase 6 · Builder UI (carousel mode)

### Task 6.1: Carousel builder sub-component

**Files:**
- Create: `src/app/(app)/plantillas/nueva/carousel-builder.tsx`

- [ ] **Step 1: Implement the sub-component**

A self-contained client component managing carousel card state. It exposes its value via `onChange`. Uses existing shadcn primitives (`Button`, `Input`, `Label`, `Card`) already in `src/components/ui`. Media upload posts to `/api/meta/upload-media` and stores `{ handle, publicUrl }` per card.

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export type CardButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

export type BuilderCard = {
  headerFormat: "IMAGE" | "VIDEO";
  handle: string | null;     // Meta example handle
  publicUrl: string | null;  // hosted link for sending
  assetId: string | null;
  body: string;
  bodyExample: string;
  buttons: CardButton[];
};

export type CarouselValue = { cards: BuilderCard[] };

const emptyCard = (): BuilderCard => ({
  headerFormat: "IMAGE", handle: null, publicUrl: null, assetId: null,
  body: "", bodyExample: "", buttons: [{ type: "URL", text: "Ver", url: "" }],
});

export function CarouselBuilder({ value, onChange }: { value: CarouselValue; onChange: (v: CarouselValue) => void }) {
  const [uploading, setUploading] = useState<number | null>(null);
  const cards = value.cards;

  function patch(i: number, p: Partial<BuilderCard>) {
    onChange({ cards: cards.map((c, idx) => (idx === i ? { ...c, ...p } : c)) });
  }

  async function upload(i: number, file: File) {
    setUploading(i);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/meta/upload-media", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      patch(i, { handle: data.handle, publicUrl: data.publicUrl, assetId: data.assetId, headerFormat: data.format === "VIDEO" ? "VIDEO" : "IMAGE" });
      toast.success("Media subida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Tarjetas del carrusel ({cards.length}/10)</Label>
        <Button type="button" variant="outline" size="sm" disabled={cards.length >= 10}
          onClick={() => onChange({ cards: [...cards, emptyCard()] })}>
          <PlusIcon className="size-4" /> Agregar tarjeta
        </Button>
      </div>
      {cards.map((card, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Tarjeta {i + 1}</span>
              <Button type="button" variant="ghost" size="sm" disabled={cards.length <= 2}
                onClick={() => onChange({ cards: cards.filter((_, idx) => idx !== i) })}>
                <Trash2Icon className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <input id={`media-${i}`} type="file" accept="image/jpeg,image/png,video/mp4" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(i, f); }} />
              <Button type="button" variant="outline" size="sm" disabled={uploading === i}
                onClick={() => document.getElementById(`media-${i}`)?.click()}>
                <UploadIcon className="size-4" /> {uploading === i ? "Subiendo…" : card.publicUrl ? "Cambiar media" : "Subir imagen/video"}
              </Button>
              {card.publicUrl && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{card.headerFormat}</span>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto de la tarjeta (usa {"{{1}}"} para variables, máx 160)</Label>
              <Input maxLength={160} value={card.body} onChange={(e) => patch(i, { body: e.target.value })} />
            </div>
            {card.buttons.map((b, bi) => (
              <div key={bi} className="grid grid-cols-2 gap-2">
                <Input placeholder="Texto del botón" value={b.text}
                  onChange={(e) => patch(i, { buttons: card.buttons.map((x, idx) => idx === bi ? { ...x, text: e.target.value } : x) })} />
                {b.type === "URL" && (
                  <Input placeholder="https://… (puede llevar {{1}})" value={(b as { url: string }).url}
                    onChange={(e) => patch(i, { buttons: card.buttons.map((x, idx) => idx === bi ? { ...x, url: e.target.value } : x) })} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {cards.length < 2 && <p className="text-xs text-destructive">El carrusel necesita al menos 2 tarjetas.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `bunx tsc --noEmit` → clean.

```bash
git add "src/app/(app)/plantillas/nueva/carousel-builder.tsx"
git commit -m "feat(builder): carousel cards sub-component"
```

---

### Task 6.2: Wire carousel mode into the template form + create action

**Files:**
- Modify: `src/app/(app)/plantillas/nueva/form.tsx`
- Modify: `src/app/(app)/plantillas/nueva/actions.ts` (create if absent — see Step 2)

- [ ] **Step 1: Add a template-type toggle + carousel state to `form.tsx`**

At the top of `TemplateForm`, add a mode toggle and carousel value state (place beside the existing form state):

```tsx
const [mode, setMode] = useState<"standard" | "carousel">("standard");
const [carousel, setCarousel] = useState<CarouselValue>({ cards: [emptyCard(), emptyCard()] });
```

Add imports:

```tsx
import { CarouselBuilder, emptyCard, type CarouselValue } from "./carousel-builder";
```

(Export `emptyCard` from `carousel-builder.tsx` by adding `export` to the `const emptyCard` declaration.)

Render the toggle above the existing fields and the builder when carousel:

```tsx
<div className="flex gap-2">
  <Button type="button" variant={mode === "standard" ? "default" : "outline"} size="sm" onClick={() => setMode("standard")}>Estándar</Button>
  <Button type="button" variant={mode === "carousel" ? "default" : "outline"} size="sm" onClick={() => setMode("carousel")}>Carrusel</Button>
</div>
{mode === "carousel" && <CarouselBuilder value={carousel} onChange={setCarousel} />}
```

In the submit handler, branch: when `mode === "carousel"`, call the new `createCarouselTemplateAction` with `{ name, language, category, body, bodyExample, cards }`; keep the existing standard path otherwise. Map each `BuilderCard` to the action payload (`handle`, `assetId`, `publicUrl`, `body`, `bodyExample`, `buttons`).

- [ ] **Step 2: Create the server action**

In `src/app/(app)/plantillas/nueva/actions.ts` add:

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { createTemplate, credsFromSettings } from "@/lib/meta/graph";
import { templateCardMedia } from "@/lib/db/schema";
import type { CardInput } from "@/lib/meta/types";

type CarouselCardPayload = {
  headerFormat: "IMAGE" | "VIDEO"; handle: string; assetId: string;
  body: string; bodyExample: string;
  buttons: Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string }>;
};

export type CreateCarouselResult = { ok: true; status: string } | { ok: false; error: string };

export async function createCarouselTemplateAction(input: {
  name: string; language: string; category: "MARKETING" | "UTILITY";
  body: string; bodyExample: string; cards: CarouselCardPayload[];
}): Promise<CreateCarouselResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) return { ok: false, error: "Configura tus credenciales de Meta primero" };
  if (input.cards.some((c) => !c.handle || !c.assetId)) return { ok: false, error: "Cada tarjeta necesita una imagen/video" };

  const cards: CardInput[] = input.cards.map((c) => ({
    header: { format: c.headerFormat, handle: c.handle },
    body: { text: c.body, example: c.bodyExample ? [c.bodyExample] : undefined },
    buttons: c.buttons.map((b) =>
      b.type === "URL" ? { type: "URL", text: b.text, url: b.url ?? "" }
      : b.type === "PHONE_NUMBER" ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number ?? "" }
      : { type: "QUICK_REPLY", text: b.text }),
  }));

  try {
    const res = await createTemplate(creds, {
      name: input.name, language: input.language, category: input.category,
      body: { text: input.body, example: input.bodyExample ? [input.bodyExample] : undefined },
      carousel: { cards },
    });
    // re-submitting the same name must not duplicate card rows
    await db
      .delete(templateCardMedia)
      .where(
        and(
          eq(templateCardMedia.orgId, orgId),
          eq(templateCardMedia.templateName, input.name),
          eq(templateCardMedia.templateLanguage, input.language),
        ),
      );
    await db.insert(templateCardMedia).values(
      input.cards.map((c, i) => ({ orgId, templateName: input.name, templateLanguage: input.language, cardIndex: i, assetId: c.assetId })),
    );
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear" };
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit` → clean.

- [ ] **Step 4: Manual smoke**

Run: `bun run dev`, go to `/plantillas/nueva`, switch to Carrusel, add 2 cards with images + buttons, submit. Expect a success toast and the template appears `PENDING` in `/plantillas`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/plantillas/nueva/form.tsx" "src/app/(app)/plantillas/nueva/actions.ts" "src/app/(app)/plantillas/nueva/carousel-builder.tsx"
git commit -m "feat(builder): carousel mode wired to create action + template_card_media"
```

---

# Phase 7 · Send wizard (carousel mapping + preview)

### Task 7.1: Carousel preview component

**Files:**
- Create: `src/components/carousel-preview.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

export type PreviewCard = { mediaUrl: string | null; body: string; buttons: string[] };

export function CarouselPreview({ topBody, cards }: { topBody: string; cards: PreviewCard[] }) {
  return (
    <div className="space-y-2">
      {topBody && <div className="rounded-lg bg-[#dcf8c6] px-3 py-2 text-sm text-black max-w-xs">{topBody}</div>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((c, i) => (
          <div key={i} className="w-48 shrink-0 rounded-lg border bg-white text-black shadow-sm">
            {c.mediaUrl
              ? <img src={c.mediaUrl} alt="" className="h-28 w-full rounded-t-lg object-cover" />
              : <div className="flex h-28 items-center justify-center rounded-t-lg bg-muted text-xs text-muted-foreground">sin media</div>}
            <div className="space-y-2 p-2">
              <p className="text-xs">{c.body}</p>
              {c.buttons.map((b, bi) => <div key={bi} className="rounded border px-2 py-1 text-center text-xs text-blue-600">{b}</div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `bunx tsc --noEmit` → clean.

```bash
git add src/components/carousel-preview.tsx
git commit -m "feat(wizard): WhatsApp-style carousel preview component"
```

---

### Task 7.2: Carousel mapping sub-component

**Files:**
- Create: `src/app/(app)/campanas/nueva/carousel-mapping.tsx`

- [ ] **Step 1: Implement**

A client component that takes the `ParsedCarousel` + the list of available contact fields and produces a mapping `Record<varKey, { kind: "field"|"literal"; value: string }>` plus the per-card media URLs (prefilled, editable). Emits its value via `onChange`.

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ParsedCarousel } from "@/lib/meta/carousel";

export type VarMapping = Record<string, { kind: "field" | "literal"; value: string }>;
export type CarouselMappingValue = { vars: VarMapping; cardMedia: Record<number, string> };

const FIELDS = ["name", "phone", "email"];

export function CarouselMapping({
  parsed, prefillMedia, value, onChange,
}: {
  parsed: ParsedCarousel;
  prefillMedia: Record<number, string>;
  value: CarouselMappingValue;
  onChange: (v: CarouselMappingValue) => void;
}) {
  const allKeys = [...parsed.topBodyVarKeys, ...parsed.cards.flatMap((c) => [...c.bodyVarKeys, ...c.buttons.flatMap((b) => (b.dynamicUrlSuffixKey ? [b.dynamicUrlSuffixKey] : []))])];

  function setVar(key: string, patch: Partial<{ kind: "field" | "literal"; value: string }>) {
    onChange({ ...value, vars: { ...value.vars, [key]: { kind: "literal", value: "", ...value.vars[key], ...patch } } });
  }

  return (
    <div className="space-y-4">
      {allKeys.map((key) => {
        const m = value.vars[key] ?? { kind: "literal" as const, value: "" };
        return (
          <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Label className="text-xs font-mono">{key}</Label>
            <select className="rounded border bg-background px-2 py-1 text-xs" value={m.kind}
              onChange={(e) => setVar(key, { kind: e.target.value as "field" | "literal" })}>
              <option value="literal">Valor fijo</option>
              <option value="field">Campo</option>
            </select>
            {m.kind === "field" ? (
              <select className="rounded border bg-background px-2 py-1 text-xs" value={m.value}
                onChange={(e) => setVar(key, { value: e.target.value })}>
                <option value="">—</option>
                {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            ) : (
              <Input className="h-7 text-xs" value={m.value} onChange={(e) => setVar(key, { value: e.target.value })} />
            )}
          </div>
        );
      })}
      <div className="space-y-2">
        <Label className="text-xs">Media por tarjeta (URL pública)</Label>
        {parsed.cards.map((_, i) => (
          <Input key={i} className="h-7 text-xs"
            value={value.cardMedia[i] ?? prefillMedia[i] ?? ""}
            placeholder={`Tarjeta ${i + 1}`}
            onChange={(e) => onChange({ ...value, cardMedia: { ...value.cardMedia, [i]: e.target.value } })} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `bunx tsc --noEmit` → clean.

```bash
git add "src/app/(app)/campanas/nueva/carousel-mapping.tsx"
git commit -m "feat(wizard): carousel variable-mapping sub-component"
```

---

### Task 7.3: Plan builder helper (TDD)

**Files:**
- Create: `src/lib/campaigns/build-carousel-plan.ts`
- Test: `tests/unit/build-carousel-plan.test.ts`

This pure helper turns the wizard mapping + parsed carousel into `{ plan: ComponentPlan; resolve(contact) => Record<string,string> }`. Field-mapped vars resolve per contact; literals are baked into `vars` for every recipient.

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, test } from "vitest";
import { buildCarouselPlan } from "@/lib/campaigns/build-carousel-plan";
import type { ParsedCarousel } from "@/lib/meta/carousel";

const parsed: ParsedCarousel = {
  topBodyVarKeys: ["body.1"],
  cards: [{ headerFormat: "IMAGE", bodyVarKeys: ["card.0.body.1"], buttons: [{ type: "URL", dynamicUrlSuffixKey: "card.0.button.0.url" }] }],
};

test("plan static parts + per-contact resolve", () => {
  const { plan, resolve } = buildCarouselPlan({
    parsed,
    vars: {
      "body.1": { kind: "field", value: "name" },
      "card.0.body.1": { kind: "literal", value: "Anillo" },
      "card.0.button.0.url": { kind: "literal", value: "p/1" },
    },
    cardMedia: { 0: "https://wa/media/a" },
  });
  expect(plan.kind).toBe("carousel");
  if (plan.kind !== "carousel") throw new Error();
  expect(plan.cards[0].headerLink).toBe("https://wa/media/a");
  expect(resolve({ name: "Juan", phone: "+57", email: "" })).toEqual({
    "body.1": "Juan", "card.0.body.1": "Anillo", "card.0.button.0.url": "p/1",
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `bun run test -- tests/unit/build-carousel-plan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { ComponentPlan } from "./component-plan";
import type { ParsedCarousel } from "@/lib/meta/carousel";

export type VarMapping = Record<string, { kind: "field" | "literal"; value: string }>;
type Contact = Record<string, string>;

export function buildCarouselPlan(input: { parsed: ParsedCarousel; vars: VarMapping; cardMedia: Record<number, string> }): {
  plan: ComponentPlan;
  resolve: (contact: Contact) => Record<string, string>;
} {
  const { parsed, vars, cardMedia } = input;
  const plan: ComponentPlan = {
    kind: "carousel",
    bodyVarKeys: parsed.topBodyVarKeys,
    cards: parsed.cards.map((c, i) => ({
      headerFormat: c.headerFormat,
      headerLink: cardMedia[i] ?? "",
      bodyVarKeys: c.bodyVarKeys,
      buttons: c.buttons,
    })),
  };
  const resolve = (contact: Contact): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, m] of Object.entries(vars)) {
      out[key] = m.kind === "field" ? contact[m.value] ?? "" : m.value;
    }
    return out;
  };
  return { plan, resolve };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `bun run test -- tests/unit/build-carousel-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/build-carousel-plan.ts tests/unit/build-carousel-plan.test.ts
git commit -m "feat(campaigns): buildCarouselPlan (mapping → plan + per-contact resolver)"
```

---

### Task 7.4: Wire mapping + plan into the wizard and campaign action

**Files:**
- Modify: `src/app/(app)/campanas/nueva/page.tsx` (load `template_card_media` prefill + pass parsed carousel)
- Modify: `src/app/(app)/campanas/nueva/wizard.tsx` (carousel branch)
- Modify: `src/app/(app)/campanas/nueva/actions.ts` (accept plan + resolved params)

- [ ] **Step 1: Page — provide carousel prefill**

In `page.tsx`, after loading templates, fetch `template_card_media` rows for the org and build a map `templateName|lang → { cardIndex → publicUrl }` (join `media_assets` → `publicMediaUrl(assetId)`); pass it to `<Wizard prefillMedia={...} />`.

- [ ] **Step 2: Wizard — carousel branch**

In `wizard.tsx`, when `selected && isCarousel(selected)`: compute `parsed = parseCarousel(selected)`, render `<CarouselMapping />` (instead of the standard var inputs) and `<CarouselPreview />` using current mapping/prefill. Keep recipient selection (tags/adhoc) unchanged. Add imports for `isCarousel`, `parseCarousel`, `CarouselMapping`, `CarouselPreview`, `buildCarouselPlan`.

On submit for a carousel template, call `buildCarouselPlan({ parsed, vars, cardMedia })`, then for tag recipients map each contact via `resolve(contact)` into `paramsByContact`, and pass `templateType: "carousel"` + `componentPlanJson: JSON.stringify(plan)` to the action.

- [ ] **Step 3: Action — accept plan**

In `actions.ts`, extend `inputSchema` with:

```ts
  templateType: z.enum(["standard", "carousel"]).optional(),
  componentPlanJson: z.string().optional().nullable(),
```

Pass them through to `createCampaign`:

```ts
    templateType: data.templateType ?? "standard",
    componentPlanJson: data.componentPlanJson ?? null,
```

For carousel campaigns the per-contact `params` come from `paramsByContact` (already supported) with namespaced keys produced by `resolve`.

- [ ] **Step 4: Typecheck + manual smoke**

Run: `bunx tsc --noEmit` → clean.
Run: `bun run dev`; create a campaign from an APPROVED carousel template, map a field + literals, pick a tag, send to a test number. Expect the carousel to arrive with mapped values.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/campanas/nueva/page.tsx" "src/app/(app)/campanas/nueva/wizard.tsx" "src/app/(app)/campanas/nueva/actions.ts"
git commit -m "feat(wizard): carousel mapping + plan persisted into campaign send"
```

---

# Phase 8 · Gate

### Task 8.1: Full green gate

- [ ] **Step 1: Lint**

Run: `bun run lint`
Expected: 0 errors.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Tests**

Run: `bun run test`
Expected: all pass (existing 34 + new ~14).

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: success. (Stop the dev server first if running — sqlite lock.)

- [ ] **Step 5: Final commit (if any lint/format fixes)**

```bash
git add -A
git commit -m "chore: carousel templates — green gate (lint/typecheck/test/build)"
```

---

## Deploy notes (for when this ships)

- `MEDIA_DIR` (default `.data/media`) must persist across deploys — keep it out of the build dir and back up/restore on each deploy, same as `.data/` sqlite. If serving behind a reverse proxy, ensure `/media/*` reaches the Next app.
- Set `PUBLIC_BASE_URL` to the public origin so `publicMediaUrl()` emits absolute URLs Meta can fetch.
- Per client (manual onboarding): set `metaAppId` in `/configuracion/meta` (their own Meta App) — required for media upload and carousel creation.
```
