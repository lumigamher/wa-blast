import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgentLoop } from "./runtime";
import { makeFakeProvider } from "./testing/fake-provider";
import { calcularTotal } from "./tools/builtin/calcular-total";
import { escalarHumano } from "./tools/builtin/escalar-humano";

const ctx = { db: {} as never, orgId: "o1", conversationId: "c1" };

describe("runAgentLoop", () => {
  it("encadena tool_call → resultado → respuesta final (determinístico)", async () => {
    const provider = makeFakeProvider([
      {
        text: null,
        toolCalls: [
          {
            id: "t1",
            name: "calcular_total",
            argsJson: JSON.stringify({
              items: [{ nombre: "Cerveza", cantidad: 2, precioUnitario: 2500 }],
            }),
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5 },
      },
      {
        text: "Son $5.000 en total.",
        toolCalls: [],
        usage: { promptTokens: 8, completionTokens: 4 },
      },
    ]);

    const res = await runAgentLoop({
      provider,
      model: "x",
      temperature: 0,
      system: "eres un asistente",
      history: [{ role: "user", content: "2 cervezas a 2500" }],
      tools: [calcularTotal],
      maxSteps: 5,
      ctx,
    });

    expect(res.status).toBe("ok");
    expect(res.reply).toBe("Son $5.000 en total.");
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0]).toMatchObject({
      tool: "calcular_total",
      result: { ok: true, data: { total: 5000 } },
    });
    expect(res.usage).toEqual({ promptTokens: 18, completionTokens: 9 });
  });

  it("escalar_a_humano corta el loop con status escalated", async () => {
    const provider = makeFakeProvider([
      {
        text: null,
        toolCalls: [
          { id: "t1", name: "escalar_a_humano", argsJson: JSON.stringify({ motivo: "pide humano" }) },
        ],
        usage: { promptTokens: 5, completionTokens: 2 },
      },
    ]);
    const res = await runAgentLoop({
      provider,
      model: "x",
      temperature: 0,
      system: "s",
      history: [{ role: "user", content: "quiero hablar con alguien" }],
      tools: [escalarHumano],
      maxSteps: 5,
      ctx,
    });
    expect(res.status).toBe("escalated");
    expect(res.reply).toBeNull();
  });

  it("args inválidos no rompen: devuelve error a la tool y reintenta", async () => {
    const provider = makeFakeProvider([
      {
        text: null,
        toolCalls: [{ id: "t1", name: "calcular_total", argsJson: JSON.stringify({ items: [] }) }],
        usage: { promptTokens: 1, completionTokens: 1 },
      },
      { text: "Necesito al menos un item.", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } },
    ]);
    const res = await runAgentLoop({
      provider,
      model: "x",
      temperature: 0,
      system: "s",
      history: [{ role: "user", content: "suma" }],
      tools: [calcularTotal],
      maxSteps: 5,
      ctx,
    });
    expect(res.status).toBe("ok");
    expect(res.reply).toBe("Necesito al menos un item.");
  });

  it("tope de pasos sin respuesta → capped", async () => {
    const toolCall = {
      text: null,
      toolCalls: [
        {
          id: "t1",
          name: "calcular_total",
          argsJson: JSON.stringify({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 1 }] }),
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1 },
    };
    const provider = makeFakeProvider([toolCall, toolCall, toolCall]);
    const res = await runAgentLoop({
      provider,
      model: "x",
      temperature: 0,
      system: "s",
      history: [{ role: "user", content: "loop" }],
      tools: [calcularTotal],
      maxSteps: 2,
      ctx,
    });
    expect(res.status).toBe("capped");
    expect(res.reply).toBeNull();
  });

  it("si una tool lanza, no rompe el loop: devuelve error y continúa", async () => {
    const throwingTool = {
      name: "explota",
      description: "lanza",
      paramsSchema: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      run: async () => {
        throw new Error("boom");
      },
    };
    const provider = makeFakeProvider([
      {
        text: null,
        toolCalls: [{ id: "t1", name: "explota", argsJson: "{}" }],
        usage: { promptTokens: 1, completionTokens: 1 },
      },
      {
        text: "Hubo un problema, lo reviso.",
        toolCalls: [],
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);
    const res = await runAgentLoop({
      provider,
      model: "x",
      temperature: 0,
      system: "s",
      history: [{ role: "user", content: "haz algo" }],
      tools: [throwingTool],
      maxSteps: 5,
      ctx,
    });
    expect(res.status).toBe("ok");
    expect(res.reply).toBe("Hubo un problema, lo reviso.");
    expect(res.steps[0]?.result).toEqual({ ok: false, error: "boom" });
  });
});
