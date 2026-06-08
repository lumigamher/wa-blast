import { expect, test } from "vitest";
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
