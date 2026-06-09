import { describe, expect, test } from "vitest";
import { validateDatos, validateContenido, validateBotones, validateTarjetas } from "@/lib/template-validation";

describe("validateDatos", () => {
  test("requires 3+ char snake_case name", () => {
    expect(validateDatos({ name: "ab", language: "es_CO", category: "UTILITY" }).join(" ")).toContain("nombre");
    expect(validateDatos({ name: "promo_oro", language: "es_CO", category: "UTILITY" })).toEqual([]);
  });
});

describe("validateContenido", () => {
  test("body required", () => {
    expect(validateContenido({ headerKind: "NONE", headerText: "", headerHandle: null, bodyText: "", bodyExample: {}, uploading: false }).join(" ")).toContain("cuerpo");
  });
  test("every variable needs an example", () => {
    const errs = validateContenido({ headerKind: "NONE", headerText: "", headerHandle: null, bodyText: "Hola {{1}}", bodyExample: {}, uploading: false });
    expect(errs.some((e) => e.includes("{{1}}"))).toBe(true);
  });
  test("media header needs an uploaded handle", () => {
    expect(validateContenido({ headerKind: "IMAGE", headerText: "", headerHandle: null, bodyText: "ok", bodyExample: {}, uploading: false }).join(" ")).toContain("archivo");
  });
  test("valid body passes", () => {
    expect(validateContenido({ headerKind: "NONE", headerText: "", headerHandle: null, bodyText: "Hola {{1}}", bodyExample: { 1: "Juan" }, uploading: false })).toEqual([]);
  });
});

describe("validateBotones", () => {
  test("button needs text + URL needs https", () => {
    expect(validateBotones([{ id: "a", kind: "URL", text: "", url: "x" }]).length).toBeGreaterThan(0);
    expect(validateBotones([{ id: "a", kind: "URL", text: "Ver", url: "https://x.co" }])).toEqual([]);
  });
});

describe("validateTarjetas", () => {
  test("needs 2 cards each with media", () => {
    expect(validateTarjetas({ cards: [{ handle: "h", assetId: "a" }] } as never).length).toBeGreaterThan(0);
    expect(validateTarjetas({ cards: [{ handle: "h", assetId: "a" }, { handle: null, assetId: null }] } as never).length).toBeGreaterThan(0);
    expect(validateTarjetas({ cards: [{ handle: "h", assetId: "a" }, { handle: "h2", assetId: "a2" }] } as never)).toEqual([]);
  });
});
