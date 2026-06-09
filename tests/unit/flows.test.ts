import { describe, expect, test } from "vitest";
import { buildCreateFlowBody } from "@/lib/meta/flows";

describe("buildCreateFlowBody", () => {
  test("stringifies flow_json + sets categories", () => {
    const body = buildCreateFlowBody({ name: "Leads", categories: ["LEAD_GENERATION"], flowJson: '{"version":"6.3","screens":[]}' });
    expect(body.name).toBe("Leads");
    expect(body.categories).toEqual(["LEAD_GENERATION"]);
    expect(typeof body.flow_json).toBe("string");
    expect(JSON.parse(body.flow_json as string).version).toBe("6.3");
  });
});
