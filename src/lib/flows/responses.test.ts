import { describe, expect, it } from "vitest";
import {
  flowResponsesToCsv,
  mapFlowFieldsToContact,
  parseFlowPayload,
} from "./responses";

const makePayload = (responseJson: string, name = "flow") =>
  JSON.stringify({
    type: "interactive",
    interactive: { type: "nfm_reply", nfm_reply: { name, response_json: responseJson } },
  });

describe("parseFlowPayload", () => {
  it("extrae campos y descarta flow_token", () => {
    const p = makePayload(
      JSON.stringify({ flow_token: "abc", nombre: "Ana", ciudad: "Cali" }),
    );
    const r = parseFlowPayload(p);
    expect(r).not.toBeNull();
    expect(r?.fields).toEqual({ nombre: "Ana", ciudad: "Cali" });
    expect(r?.flowName).toBeNull(); // name === "flow" → null
  });

  it("conserva el nombre del flow cuando no es genérico", () => {
    const p = makePayload(JSON.stringify({ a: 1 }), "lead_form");
    expect(parseFlowPayload(p)?.flowName).toBe("lead_form");
  });

  it("devuelve null si no es nfm_reply", () => {
    expect(parseFlowPayload(JSON.stringify({ type: "text" }))).toBeNull();
    expect(parseFlowPayload(null)).toBeNull();
    expect(parseFlowPayload("no-json")).toBeNull();
  });

  it("tolera response_json inválido", () => {
    const p = JSON.stringify({
      interactive: { nfm_reply: { name: "flow", response_json: "{oops" } },
    });
    expect(parseFlowPayload(p)?.fields).toEqual({});
  });
});

describe("mapFlowFieldsToContact", () => {
  it("mapea sinónimos ES/EN a campos del contacto", () => {
    expect(
      mapFlowFieldsToContact({
        Nombre: "Ana",
        Empresa: "Acme",
        ciudad: "Cali",
      }),
    ).toEqual({ name: "Ana", company: "Acme", city: "Cali" });
  });

  it("ignora acentos y mayúsculas en la clave", () => {
    expect(mapFlowFieldsToContact({ "Correo electrónico": "a@x.com" })).toEqual({
      email: "a@x.com",
    });
  });

  it("ignora campos desconocidos y valores vacíos", () => {
    expect(
      mapFlowFieldsToContact({ comentario: "hola", ciudad: "  " }),
    ).toEqual({});
  });
});

describe("flowResponsesToCsv", () => {
  const base = {
    id: "1",
    orgId: "o1",
    conversationId: null,
    contactId: null,
    wamid: null,
    createdAt: new Date("2026-06-19T15:00:00.000Z"),
  };

  it("aplana campos como columnas (unión de claves) y escapa comas", () => {
    const csv = flowResponsesToCsv([
      {
        ...base,
        bsuid: null,
      phone: "573001112233",
        contactName: "Ana, V.",
        flowName: "lead",
        fieldsJson: JSON.stringify({ nombre: "Ana", ciudad: "Cali" }),
      },
      {
        ...base,
        id: "2",
        bsuid: null,
      phone: "573004445566",
        contactName: null,
        flowName: null,
        fieldsJson: JSON.stringify({ nombre: "Beto", email: "b@x.com" }),
      },
    ]);
    const lines = csv.split("\n");
    // header: fijas + claves ordenadas (ciudad, email, nombre)
    expect(lines[0]).toBe("fecha,telefono,contacto,flow,ciudad,email,nombre");
    // coma en el nombre → entrecomillado
    expect(lines[1]).toContain('"Ana, V."');
    expect(lines[1]).toContain("Cali");
    // fila 2 sin ciudad → celda vacía
    expect(lines[2]).toContain("573004445566");
    expect(lines[2]).toContain("b@x.com");
  });

  it("csv vacío solo trae la cabecera base", () => {
    expect(flowResponsesToCsv([])).toBe("fecha,telefono,contacto,flow");
  });
});
