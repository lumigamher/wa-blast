import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import type { DB } from "@/lib/db/client";
import { calls, conversations, organization } from "@/lib/db/schema";
import { getCallsForConversation, listCalls, recordCallEvent } from "@/lib/calls/store";

async function seed(db: DB) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
}

describe("calls store", () => {
  it("connect crea ringing, terminate lo completa con duración (upsert)", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.A", direction: "in", event: "connect", ts: new Date(1000) });
    let rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.A"));
    expect(rows[0].status).toBe("ringing");
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.A", direction: "in", event: "terminate", durationSec: 134, ts: new Date(2000) });
    rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.A"));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].durationSec).toBe(134);
  });
  it("terminate sin duración → missed", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.B", direction: "in", event: "terminate", durationSec: 0, ts: new Date() });
    expect((await db.select().from(calls).where(eq(calls.wacid, "wacid.B")))[0].status).toBe("missed");
  });
  it("listCalls filtra por estado y aísla por org; getCallsForConversation", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "w1", direction: "in", event: "terminate", durationSec: 10, ts: new Date() });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "w2", direction: "in", event: "terminate", durationSec: 0, ts: new Date() });
    expect((await listCalls(db, "o1", {})).length).toBe(2);
    expect((await listCalls(db, "o1", { status: "missed" })).length).toBe(1);
    expect((await listCalls(db, "o2", {})).length).toBe(0);
    expect((await getCallsForConversation(db, "o1", "c1")).length).toBe(2);
  });
});
