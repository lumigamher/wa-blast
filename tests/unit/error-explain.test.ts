import { describe, expect, it } from "vitest";
import { explainMetaError } from "@/lib/meta/error-explain";

describe("explainMetaError", () => {
  it("traduce la ventana de 24h", () => {
    expect(
      explainMetaError("(#131047) Re-engagement message. Message failed to send because more than 24 hours have passed."),
    ).toContain("24 horas");
  });
  it("traduce número no alcanzable", () => {
    expect(explainMetaError("(#131026) Message undeliverable")).toContain("no puede recibir");
  });
  it("traduce variables de plantilla", () => {
    expect(explainMetaError("(#132000) Number of parameters does not match")).toContain("variables");
  });
  it("traduce token vencido", () => {
    expect(explainMetaError("Error validating access token: Session has expired")).toContain("conexión con WhatsApp");
  });
  it("fallback claro para errores desconocidos", () => {
    expect(explainMetaError("(#999999) weird internal thing")).toBe("No se pudo entregar el mensaje.");
    expect(explainMetaError(null)).toBe("No se pudo entregar el mensaje.");
  });
});
