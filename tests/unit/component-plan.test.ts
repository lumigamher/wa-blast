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
