import { describe, expect, it } from "vitest";
import { displayIdentity } from "./display-identity";

describe("displayIdentity", () => {
  it("prefiere el nombre del contacto", () => {
    expect(displayIdentity({ name: "Juan", username: "juanda", phone: "+57300", bsuid: "US.9" })).toBe("Juan");
  });

  it("usa el @username cuando no hay nombre", () => {
    expect(displayIdentity({ username: "juanda", phone: null, bsuid: "US.9" })).toBe("@juanda");
  });

  it("no duplica la arroba si el username ya la trae", () => {
    expect(displayIdentity({ username: "@juanda" })).toBe("@juanda");
  });

  it("cae al teléfono cuando no hay nombre ni username", () => {
    expect(displayIdentity({ phone: "+573001112233", bsuid: "US.9" })).toBe("+573001112233");
  });

  it("como último recurso abrevia el BSUID, que es ilegible entero", () => {
    expect(displayIdentity({ bsuid: "US.13491208655302741918" })).toBe("US.…41918");
  });

  it("no se rompe cuando no hay absolutamente nada", () => {
    expect(displayIdentity({})).toBe("Sin identificar");
  });

  it("ignora cadenas en blanco", () => {
    expect(displayIdentity({ name: "   ", username: "juanda" })).toBe("@juanda");
  });
});
