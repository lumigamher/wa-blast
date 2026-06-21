import { describe, expect, it } from "vitest";
import { extractDocumentText } from "./extract";

function fileFrom(name: string, type: string, content: string): File {
  return new File([content], name, { type });
}

describe("extractDocumentText", () => {
  it("txt → devuelve el texto tal cual", async () => {
    expect(await extractDocumentText(fileFrom("notas.txt", "text/plain", "Hola mundo"))).toBe("Hola mundo");
  });
  it("markdown → devuelve el texto tal cual", async () => {
    const out = await extractDocumentText(fileFrom("doc.md", "text/markdown", "# Título\nContenido"));
    expect(out).toContain("Título");
    expect(out).toContain("Contenido");
  });
  it("extensión desconocida pero texto → lo decodifica", async () => {
    expect(await extractDocumentText(fileFrom("x.csv", "", "a,b,c"))).toBe("a,b,c");
  });
  it("PDF ilegible → lanza error claro", async () => {
    await expect(extractDocumentText(fileFrom("malo.pdf", "application/pdf", "no soy un pdf"))).rejects.toThrow(/pdf/i);
  });
});
