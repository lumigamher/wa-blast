import { describe, expect, it } from "vitest";
import {
  parseWhatsAppText,
  stripWhatsAppFormat,
  type Inline,
} from "./whatsapp-render";

/** Atajo: las líneas "planas" del primer bloque. */
function inl(text: string): Inline[] {
  const b = parseWhatsAppText(text)[0];
  if (!b || b.type !== "line") throw new Error("se esperaba un bloque line");
  return b.children;
}

describe("parseWhatsAppText: marcadores en línea", () => {
  it("negrita, cursiva, tachado y código", () => {
    expect(inl("*hola*")).toEqual([
      { type: "bold", children: [{ type: "text", value: "hola" }] },
    ]);
    expect(inl("_hola_")).toEqual([
      { type: "italic", children: [{ type: "text", value: "hola" }] },
    ]);
    expect(inl("~hola~")).toEqual([
      { type: "strike", children: [{ type: "text", value: "hola" }] },
    ]);
    expect(inl("`a*b*`")).toEqual([{ type: "code", value: "a*b*" }]);
  });

  it("marcador en medio de una frase", () => {
    expect(inl("Hola *Luis*, ¿qué más?")).toEqual([
      { type: "text", value: "Hola " },
      { type: "bold", children: [{ type: "text", value: "Luis" }] },
      { type: "text", value: ", ¿qué más?" },
    ]);
  });

  it("casos negativos: no se formatea", () => {
    for (const s of [
      "2*3*4",
      "snake_case_var",
      "archivo_final_v2.pdf",
      "un * suelto * aquí",
      "* ",
      "*hola *",
      "* hola*",
      "a ~ b ~ c",
      "sin cerrar *hola",
    ]) {
      const b = parseWhatsAppText(s)[0];
      expect(JSON.stringify(b)).not.toMatch(/bold|italic|strike/);
    }
  });

  it("el marcador no cruza líneas", () => {
    const blocks = parseWhatsAppText("*uno\ndos*");
    expect(JSON.stringify(blocks)).not.toContain("bold");
  });

  it("anidamiento simple", () => {
    expect(inl("*_x_*")).toEqual([
      {
        type: "bold",
        children: [
          { type: "italic", children: [{ type: "text", value: "x" }] },
        ],
      },
    ]);
  });

  it("pseudo-markdown: **x** y __x__ son negrita", () => {
    const bold = [{ type: "bold", children: [{ type: "text", value: "x" }] }];
    expect(inl("**x**")).toEqual(bold);
    expect(inl("__x__")).toEqual(bold);
  });

  it("pseudo-markdown: [texto](url) es enlace", () => {
    expect(inl("[ver](https://a.co/x)")).toEqual([
      {
        type: "link",
        href: "https://a.co/x",
        children: [{ type: "text", value: "ver" }],
      },
    ]);
  });

  it("[texto](javascript:...) NO es enlace", () => {
    expect(JSON.stringify(parseWhatsAppText("[x](javascript:alert(1))"))).not.toContain(
      '"link"',
    );
  });
});

describe("parseWhatsAppText: URLs", () => {
  it("http(s) y www; sin puntuación final pegada", () => {
    expect(inl("mira https://a.co/x?y=1.")).toEqual([
      { type: "text", value: "mira " },
      {
        type: "link",
        href: "https://a.co/x?y=1",
        children: [{ type: "text", value: "https://a.co/x?y=1" }],
      },
      { type: "text", value: "." },
    ]);
    const w = inl("(www.lula.com)");
    expect(w[1]).toMatchObject({ type: "link", href: "https://www.lula.com" });
    expect(w[2]).toEqual({ type: "text", value: ")" });
  });

  it("una URL con guiones bajos no se vuelve cursiva", () => {
    const t = inl("http://a.co/a_b_c");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ type: "link", href: "http://a.co/a_b_c" });
  });

  it("javascript: jamás es enlace", () => {
    expect(JSON.stringify(parseWhatsAppText("javascript:alert(1)"))).not.toContain(
      '"link"',
    );
  });
});

describe("parseWhatsAppText: bloques", () => {
  it("bloque ``` multilínea sin formato adentro", () => {
    const b = parseWhatsAppText("antes\n```\nlinea *1*\n  linea 2\n```\ndespués");
    expect(b).toEqual([
      { type: "line", children: [{ type: "text", value: "antes" }] },
      { type: "pre", value: "linea *1*\n  linea 2" },
      { type: "line", children: [{ type: "text", value: "después" }] },
    ]);
  });

  it("``` sin cerrar queda como texto", () => {
    expect(parseWhatsAppText("```abc")[0]).toMatchObject({ type: "line" });
  });

  it("citas, listas y títulos", () => {
    const b = parseWhatsAppText("> cita\n- uno\n* dos\n3. tres\n## Título");
    expect(b[0]).toMatchObject({ type: "quote" });
    expect(b[1]).toMatchObject({ type: "list", marker: "•" });
    expect(b[2]).toMatchObject({ type: "list", marker: "•" });
    expect(b[3]).toMatchObject({ type: "list", marker: "3." });
    expect(b[4]).toEqual({
      type: "line",
      children: [{ type: "bold", children: [{ type: "text", value: "Título" }] }],
    });
  });

  it("texto vacío o nulo", () => {
    expect(parseWhatsAppText("")).toEqual([]);
    expect(parseWhatsAppText(null)).toEqual([]);
    expect(parseWhatsAppText(undefined)).toEqual([]);
  });
});

describe("stripWhatsAppFormat", () => {
  it("quita marcadores y deja el texto", () => {
    expect(stripWhatsAppFormat("*Hola* _mundo_ ~x~ `y`")).toBe("Hola mundo x y");
    expect(stripWhatsAppFormat("**a** y [b](https://c.co)")).toBe("a y b");
    expect(stripWhatsAppFormat("```\ncódigo *x*\n```")).toBe("código *x*");
    expect(stripWhatsAppFormat("2*3*4 snake_case_var")).toBe("2*3*4 snake_case_var");
    expect(stripWhatsAppFormat("> cita\n## T")).toBe("cita\nT");
  });

  it("vacío", () => {
    expect(stripWhatsAppFormat("")).toBe("");
    expect(stripWhatsAppFormat(null)).toBe("");
  });
});
