import { describe, expect, test } from "vitest";
import { matchOptOut } from "@/lib/optout/match";

describe("matchOptOut", () => {
  const kw = ["STOP", "BAJA", "UNSUBSCRIBE"];
  test("exact match, case insensitive", () => {
    expect(matchOptOut("stop", kw)).toBe(true);
    expect(matchOptOut("  BAJA  ", kw)).toBe(true);
  });
  test("word boundary (STOPARD is not a match)", () => {
    expect(matchOptOut("stopard", kw)).toBe(false);
  });
  test("phrase containing keyword", () => {
    expect(matchOptOut("quiero unsubscribe por favor", kw)).toBe(true);
  });
  test("no match", () => {
    expect(matchOptOut("hola, cómo están?", kw)).toBe(false);
  });
});
