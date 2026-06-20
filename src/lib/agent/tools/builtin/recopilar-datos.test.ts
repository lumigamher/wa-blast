import { describe, expect, it } from "vitest";
import { recopilarDatos } from "./recopilar-datos";

describe("recopilar_datos", () => {
  it("devuelve los campos recogidos", async () => {
    const r = await recopilarDatos.run(
      { campos: { nombre: "Ana", ciudad: "Cali" } },
      { db: {} as never, orgId: "o1", conversationId: "c1" },
    );
    expect(r).toEqual({
      ok: true,
      data: { recogidos: { nombre: "Ana", ciudad: "Cali" } },
    });
  });
});
