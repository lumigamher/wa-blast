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
});
