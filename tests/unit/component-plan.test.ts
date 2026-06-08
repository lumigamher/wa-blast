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
