import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentRuns, organization } from "@/lib/db/schema";
import { isOverCostCap, monthlyCostCop } from "./guardrails";

async function seedRun(db: ReturnType<typeof makeTestDb>["db"], cost: number) {
  await db.insert(agentRuns).values({
    id: randomUUID(),
    orgId: "o1",
    conversationId: null,
    stepsJson: "[]",
    promptTokens: 0,
    completionTokens: 0,
    costCop: cost,
    status: "ok",
    createdAt: new Date(),
  });
}

describe("guardrails", () => {
  it("suma el costo del mes y detecta tope superado", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await seedRun(db, 300);
    await seedRun(db, 250);
    expect(await monthlyCostCop(db, "o1")).toBe(550);
    expect(await isOverCostCap(db, "o1", 500)).toBe(true);
    expect(await isOverCostCap(db, "o1", 1000)).toBe(false);
    expect(await isOverCostCap(db, "o1", null)).toBe(false);
  });
});
