import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentTools, organization } from "@/lib/db/schema";
import { resolveTools } from "./registry";

describe("tool registry", () => {
  it("incluye built-ins habilitadas + conectores http de la org", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(agentTools).values({
      id: randomUUID(),
      orgId: "o1",
      type: "builtin",
      key: "calcular_total",
      enabled: true,
      configJson: "{}",
      createdAt: new Date(),
    });
    await db.insert(agentTools).values({
      id: randomUUID(),
      orgId: "o1",
      type: "http",
      key: "buscar_producto",
      enabled: true,
      configJson: JSON.stringify({
        name: "buscar_producto",
        description: "Busca producto",
        method: "GET",
        urlTemplate: "https://x/api",
        headers: {},
        auth: { type: "none" },
        params: [{ name: "q", type: "string", required: true, in: "query" }],
        responseMapping: null,
      }),
      createdAt: new Date(),
    });

    const tools = await resolveTools(db, "o1");
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain("calcular_total");
    expect(names).toContain("buscar_producto");
  });

  it("ignora tools deshabilitadas o builtin desconocida", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(agentTools).values({
      id: randomUUID(),
      orgId: "o2",
      type: "builtin",
      key: "no_existe",
      enabled: true,
      configJson: "{}",
      createdAt: new Date(),
    });
    expect(await resolveTools(db, "o2")).toHaveLength(0);
  });
});
