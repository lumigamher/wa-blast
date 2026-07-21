import { describe, expect, it, vi } from "vitest";
import { makeGoogleProvider } from "@/lib/agent/providers/google";

describe("makeGoogleProvider", () => {
  it("chat simple: mapea texto y usage", async () => {
    const f = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "hola" }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const p = makeGoogleProvider("AIza", f);
    const r = await p.chat({ system: "s", messages: [{ role: "user", content: "hola" }], tools: [], temperature: 0.5, model: "gemini-2.5-flash" });
    expect(r.text).toBe("hola");
    expect(r.toolCalls).toHaveLength(0);
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 3 });
  });

  it("function calling: emite toolCalls con id nombre__n y arma functionResponse", async () => {
    let sentBody: Record<string, unknown> = {};
    const f = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ functionCall: { name: "crear_pedido", args: { items: [] } } }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const p = makeGoogleProvider("AIza", f);
    const r = await p.chat({
      system: "s",
      messages: [
        { role: "user", content: "quiero 2 burguers" },
        { role: "assistant", content: null, toolCalls: [{ id: "cotizar_envio__0", name: "cotizar_envio", argsJson: '{"ciudadDestino":"Bogotá"}' }] },
        { role: "tool", toolCallId: "cotizar_envio__0", content: '{"ok":true,"priceCop":8000}' },
      ],
      tools: [{ name: "crear_pedido", description: "crea", parameters: { type: "object" } }],
      temperature: 0,
      model: "gemini-2.5-flash",
    });
    expect(r.toolCalls[0]).toMatchObject({ id: "crear_pedido__0", name: "crear_pedido" });
    // El historial mapeado incluye el functionResponse con el nombre correcto
    const contents = sentBody.contents as { role: string; parts: Record<string, unknown>[] }[];
    const fr = contents.find((c) => c.parts.some((p2) => "functionResponse" in p2));
    expect(fr).toBeTruthy();
    const part = fr?.parts.find((p2) => "functionResponse" in p2) as { functionResponse: { name: string } };
    expect(part.functionResponse.name).toBe("cotizar_envio");
    // Y las tools van declaradas
    expect(sentBody.tools).toBeTruthy();
  });

  it("error HTTP → throw con detalle", async () => {
    const f = vi.fn(async () => new Response("bad key", { status: 400 })) as unknown as typeof fetch;
    const p = makeGoogleProvider("AIza", f);
    await expect(
      p.chat({ system: "s", messages: [{ role: "user", content: "x" }], tools: [], temperature: 0, model: "gemini-2.5-flash" }),
    ).rejects.toThrow("Gemini 400");
  });
});
