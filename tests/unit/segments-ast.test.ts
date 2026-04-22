import { describe, expect, test } from "vitest";
import { segmentRuleSchema } from "@/lib/segments/ast";

describe("segmentRuleSchema", () => {
  test("accepts a nested AND/OR rule", () => {
    const rule = {
      combinator: "AND",
      conditions: [
        { field: "tag", op: "in", value: ["vip"] },
        {
          combinator: "OR",
          conditions: [
            { field: "custom.city", op: "eq", value: "Bogota" },
            { field: "custom.city", op: "eq", value: "Medellin" },
          ],
        },
      ],
    };
    expect(() => segmentRuleSchema.parse(rule)).not.toThrow();
  });

  test("rejects invalid op", () => {
    const rule = {
      combinator: "AND",
      conditions: [{ field: "tag", op: "nope", value: "x" }],
    };
    expect(() => segmentRuleSchema.parse(rule)).toThrow();
  });
});
