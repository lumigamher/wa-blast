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
