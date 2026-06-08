import { describe, expect, test } from "vitest";
import { buildCreateComponents, validateCarousel } from "@/lib/meta/graph";
import type { CardInput } from "@/lib/meta/types";

const card = (over: Partial<CardInput> = {}): CardInput => ({
  header: { format: "IMAGE", handle: "h1" },
  body: { text: "Card {{1}}", example: ["Anillo"] },
  buttons: [
    { type: "URL", text: "Ver", url: "https://s.co/{{1}}", example: ["p/1"] },
    { type: "QUICK_REPLY", text: "Info" },
  ],
  ...over,
});

describe("validateCarousel", () => {
  test("rejects <2 cards", () => {
    expect(() => validateCarousel([card()])).toThrow(/2/);
  });
  test("rejects mixed header formats", () => {
    expect(() =>
      validateCarousel([card(), card({ header: { format: "VIDEO", handle: "h2" } })])
    ).toThrow(/format/i);
  });
  test("rejects different button structure", () => {
    expect(() =>
      validateCarousel([card(), card({ buttons: [{ type: "QUICK_REPLY", text: "x" }] })])
    ).toThrow(/button/i);
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
