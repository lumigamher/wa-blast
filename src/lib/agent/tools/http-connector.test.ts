import { describe, expect, it, vi } from "vitest";
import { makeHttpTool, type HttpConnectorConfig } from "./http-connector";

const cfg: HttpConnectorConfig = {
  name: "buscar_producto",
  description: "Busca un producto por nombre",
  method: "GET",
  urlTemplate: "https://api.tienda.com/productos",
  headers: {},
  auth: { type: "none" },
  params: [{ name: "q", type: "string", required: true, in: "query" }],
  responseMapping: null,
};

describe("http connector", () => {
  it("valida args, hace fetch y devuelve el JSON", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ nombre: "Cerveza", precio: 2500 }), {
          status: 200,
        }),
      );
    const tool = makeHttpTool(cfg);
    const r = await tool.run(
      { q: "cerveza" },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r).toEqual({ ok: true, data: { nombre: "Cerveza", precio: 2500 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tienda.com/productos?q=cerveza",
      expect.objectContaining({ method: "GET" }),
    );
    fetchMock.mockRestore();
  });

  it("rechaza args inválidos (param requerido faltante)", () => {
    const tool = makeHttpTool(cfg);
    expect(tool.paramsSchema.safeParse({}).success).toBe(false);
  });

  it("error de red → ToolResult ok:false", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("boom", { status: 500 }));
    const tool = makeHttpTool(cfg);
    const r = await tool.run(
      { q: "x" },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r.ok).toBe(false);
    fetchMock.mockRestore();
  });
});
