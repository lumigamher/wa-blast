import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getAgentConfig, saveAgentConfig } from "./config";

async function org(db: ReturnType<typeof makeTestDb>["db"]) {
  await db
    .insert(organization)
    .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("agent config", () => {
  it("devuelve defaults cuando no existe", async () => {
    const { db } = makeTestDb();
    await org(db);
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.enabled).toBe(false);
    expect(cfg.provider).toBe("openai");
    expect(cfg.maxStepsPerTurn).toBe(5);
  });

  it("guarda y relee (upsert)", async () => {
    const { db } = makeTestDb();
    await org(db);
    await saveAgentConfig(db, "o1", { enabled: true, name: "Lula Bot" });
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.enabled).toBe(true);
    expect(cfg.name).toBe("Lula Bot");
  });
});
