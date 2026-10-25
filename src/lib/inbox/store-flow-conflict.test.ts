import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { messages, organization } from "@/lib/db/schema";

// Choque de índice único que NO es el del mensaje (otra sentencia de la transacción).
vi.mock("@/lib/flows/responses", () => ({
  recordFlowResponseSync: () => {
    throw Object.assign(new Error("UNIQUE constraint failed: flow_responses.x"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });
  },
}));

const { recordInboundMessage } = await import("./store");

describe("recordInboundMessage: choque fuera del INSERT del mensaje", () => {
  it("relanza el error (no lo reporta como duplicado) y revierte el mensaje", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "Org", slug: "o1", createdAt: new Date() });
    const parsed = {
      type: "flow",
      body: "form",
      mediaId: null,
      payloadJson: "{}",
      replyToWamid: null,
    } as unknown as Parameters<typeof recordInboundMessage>[1]["parsed"];
    await expect(
      recordInboundMessage(db, { orgId: "o1", identity: { phone: "+573009" }, wamid: "wamid.FLOW", parsed, ts: new Date() }),
    ).rejects.toThrow(/flow_responses/);
    const rows = await db.select().from(messages).where(eq(messages.wamid, "wamid.FLOW"));
    expect(rows).toHaveLength(0);
  });
});
