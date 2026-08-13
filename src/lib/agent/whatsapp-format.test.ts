import { describe, expect, it } from "vitest";
import { toWhatsAppFormat } from "./whatsapp-format";

describe("toWhatsAppFormat", () => {
  it("convierte la negrita de markdown a la de WhatsApp", () => {
    expect(toWhatsAppFormat("Tenemos **audífonos** en stock")).toBe("Tenemos *audífonos* en stock");
  });

  it("convierte varias negritas en la misma línea", () => {
    expect(toWhatsAppFormat("**A** y **B**")).toBe("*A* y *B*");
  });

  it("convierte la negrita con guiones bajos", () => {
    expect(toWhatsAppFormat("Precio __final__ hoy")).toBe("Precio *final* hoy");
  });

  it("deja intacta la negrita que ya está en formato WhatsApp", () => {
    expect(toWhatsAppFormat("Tenemos *audífonos* en stock")).toBe("Tenemos *audífonos* en stock");
  });

  it("convierte títulos en negrita, que es lo más cercano en WhatsApp", () => {
    expect(toWhatsAppFormat("## Catálogo\nAudífonos")).toBe("*Catálogo*\nAudífonos");
    expect(toWhatsAppFormat("### Envíos")).toBe("*Envíos*");
  });

  it("aplana los enlaces de markdown, que WhatsApp muestra crudos", () => {
    expect(toWhatsAppFormat("Mira [el catálogo](https://tienda.co/cat)")).toBe(
      "Mira el catálogo: https://tienda.co/cat",
    );
  });

  it("no toca una URL suelta", () => {
    const t = "Entra a https://tienda.co/cat?a=1&b=2";
    expect(toWhatsAppFormat(t)).toBe(t);
  });

  it("no rompe un asterisco de multiplicación ni uno suelto", () => {
    expect(toWhatsAppFormat("2 * 3 = 6")).toBe("2 * 3 = 6");
    expect(toWhatsAppFormat("promo * aplica")).toBe("promo * aplica");
  });

  it("respeta los bloques de código, que WhatsApp sí entiende", () => {
    const t = "```\nSKU-123\n```";
    expect(toWhatsAppFormat(t)).toBe(t);
  });

  it("no altera el texto que ya está limpio", () => {
    const t = "¡Hola! ¿En qué te ayudo hoy? 😊";
    expect(toWhatsAppFormat(t)).toBe(t);
  });

  it("tolera vacío y nulo sin reventar", () => {
    expect(toWhatsAppFormat("")).toBe("");
    expect(toWhatsAppFormat(null)).toBe("");
    expect(toWhatsAppFormat(undefined)).toBe("");
  });

  it("maneja el caso real que salía en producción", () => {
    const crudo = "¡Claro! Tenemos varias opciones 🎮⌨️\n\n**Teclado K120** — $59.000\n**Mouse M170** — $39.000";
    expect(toWhatsAppFormat(crudo)).toBe(
      "¡Claro! Tenemos varias opciones 🎮⌨️\n\n*Teclado K120* — $59.000\n*Mouse M170* — $39.000",
    );
  });
});
