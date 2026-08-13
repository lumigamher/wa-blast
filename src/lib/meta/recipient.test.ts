import { describe, expect, it } from "vitest";
import { addressFields, recipientFields, type Recipient } from "./recipient";

describe("recipientFields", () => {
  it("manda `to` cuando hay teléfono, sin el prefijo +", () => {
    expect(recipientFields({ phone: "+573001112233" })).toEqual({ to: "573001112233" });
  });

  it("manda `recipient` cuando solo hay BSUID", () => {
    expect(recipientFields({ bsuid: "US.13491208655302741918" })).toEqual({
      recipient: "US.13491208655302741918",
    });
  });

  it("prefiere el teléfono si están los dos (Meta le da precedencia igual)", () => {
    expect(recipientFields({ phone: "+573001112233", bsuid: "US.999" })).toEqual({
      to: "573001112233",
    });
  });

  it("ignora un teléfono vacío y cae al BSUID", () => {
    expect(recipientFields({ phone: null, bsuid: "US.999" })).toEqual({ recipient: "US.999" });
    expect(recipientFields({ phone: "  ", bsuid: "US.999" })).toEqual({ recipient: "US.999" });
  });

  it("falla explícito si no hay a quién mandarle", () => {
    expect(() => recipientFields({} as Recipient)).toThrow(/destinatario/i);
    expect(() => recipientFields({ phone: null, bsuid: null })).toThrow(/destinatario/i);
  });
});

describe("addressFields", () => {
  it("acepta el string de siempre para no romper a los llamadores actuales", () => {
    expect(addressFields("+573001112233")).toEqual({ to: "573001112233" });
  });

  it("acepta un Recipient con BSUID", () => {
    expect(addressFields({ bsuid: "US.999" })).toEqual({ recipient: "US.999" });
  });
});
