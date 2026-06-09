import { describe, expect, test } from "vitest";
import { normalizeTemplateName } from "@/lib/template-name";

describe("normalizeTemplateName", () => {
  test("lowercases and spaces → underscore", () => {
    expect(normalizeTemplateName("Promo Oro")).toBe("promo_oro");
  });
  test("strips diacritics", () => {
    expect(normalizeTemplateName("Promo Oro Día")).toBe("promo_oro_dia");
  });
  test("removes invalid chars", () => {
    expect(normalizeTemplateName("¡Promo! 20%@oro")).toBe("promo_20_oro");
  });
  test("hyphens → underscore", () => {
    expect(normalizeTemplateName("promo-oro-2026")).toBe("promo_oro_2026");
  });
  test("collapses repeated underscores", () => {
    expect(normalizeTemplateName("promo   oro__día")).toBe("promo_oro_dia");
  });
  test("trims leading/trailing underscores", () => {
    expect(normalizeTemplateName("  _promo oro_  ")).toBe("promo_oro");
  });
  test("already valid is unchanged", () => {
    expect(normalizeTemplateName("promo_oro_2026")).toBe("promo_oro_2026");
  });
  test("empty stays empty", () => {
    expect(normalizeTemplateName("")).toBe("");
  });
});
