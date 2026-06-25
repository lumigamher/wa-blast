import { describe, expect, it } from "vitest";
import { buildSystemPrompt, toLlmHistory } from "./context";

describe("context", () => {
  it("arma el system prompt con persona + reglas", () => {
    const s = buildSystemPrompt({
      name: "Lula",
      systemPrompt: "Eres amable y vendes cerveza.",
    });
    expect(s).toContain("Lula");
    expect(s).toContain("vendes cerveza");
    expect(s.toLowerCase()).toContain("herramienta");
  });

  it("convierte mensajes del hilo a LlmMessage (in=user, out=assistant)", () => {
    const msgs = toLlmHistory([
      { direction: "in", body: "hola" },
      { direction: "out", body: "¿en qué te ayudo?" },
      { direction: "in", body: "quiero 2 cervezas" },
    ]);
    expect(msgs).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "¿en qué te ayudo?" },
      { role: "user", content: "quiero 2 cervezas" },
    ]);
  });

  it("inyecta el bloque de conocimiento cuando se provee", () => {
    const s = buildSystemPrompt({ name: "Lula", systemPrompt: "Vendes cerveza.", knowledge: "El envío cuesta 5000 pesos." });
    expect(s).toContain("Información de la empresa");
    expect(s).toContain("El envío cuesta 5000 pesos");
  });

  it("sin knowledge no añade el bloque de empresa", () => {
    const s = buildSystemPrompt({ name: "Lula", systemPrompt: "Vendes cerveza." });
    expect(s).not.toContain("Información de la empresa");
  });

  it("inyecta la ficha del cliente cuando se provee", () => {
    const s = buildSystemPrompt({
      name: "Lula",
      systemPrompt: "Vendes cerveza.",
      customerProfile: "Cliente: nombre: Ana · ciudad: Cali",
    });
    expect(s).toContain("Ficha del cliente");
    expect(s).toContain("Ana");
    expect(s).toContain("Cali");
  });

  it("sin customerProfile no añade el bloque de ficha", () => {
    const s = buildSystemPrompt({ name: "Lula", systemPrompt: "Vendes cerveza." });
    expect(s).not.toContain("Ficha del cliente");
  });

  it("ordena correctamente: base → ficha → knowledge", () => {
    const s = buildSystemPrompt({
      name: "Lula",
      systemPrompt: "Vendes cerveza.",
      customerProfile: "Cliente: Ana",
      knowledge: "Envío gratis.",
    });
    const fichaIdx = s.indexOf("Ficha del cliente");
    const knowledgeIdx = s.indexOf("Información de la empresa");
    expect(fichaIdx).toBeGreaterThan(-1);
    expect(knowledgeIdx).toBeGreaterThan(fichaIdx);
  });
});
