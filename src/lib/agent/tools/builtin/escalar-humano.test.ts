import { describe, expect, it } from "vitest";
import { escalarHumano } from "./escalar-humano";

describe("escalar_a_humano", () => {
  it("devuelve escalado con el motivo", async () => {
    const r = await escalarHumano.run(
      { motivo: "pide hablar con una persona" },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r).toEqual({
      ok: true,
      data: { escalado: true, motivo: "pide hablar con una persona" },
    });
  });
});
