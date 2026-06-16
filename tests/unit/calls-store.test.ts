import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import type { DB } from "@/lib/db/client";
import { calls, conversations, organization } from "@/lib/db/schema";
import { getCallById, getCallsForConversation, getRingingCalls, listCalls, markCallConnected, markCallRejected, recordCallEvent } from "@/lib/calls/store";

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
  it("connect con SDP persiste sdp/sdpType y no los pisa con null en terminate", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.S", direction: "in", event: "connect", sdp: "v=0...", sdpType: "offer", ts: new Date(1000) });
    let rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.S"));
    expect(rows[0].sdp).toBe("v=0...");
    expect(rows[0].sdpType).toBe("offer");
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "wacid.S", direction: "in", event: "terminate", durationSec: 5, ts: new Date(2000) });
    rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.S"));
    expect(rows[0].sdp).toBe("v=0...");
  });
  it("terminate con status reject/fail mapea a rejected/failed; no-answer a missed", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "r1", direction: "in", event: "terminate", status: "REJECTED", ts: new Date() });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "f1", direction: "in", event: "terminate", status: "FAILED", ts: new Date() });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "n1", direction: "in", event: "terminate", status: "NO_ANSWER", ts: new Date() });
    expect((await db.select().from(calls).where(eq(calls.wacid, "r1")))[0].status).toBe("rejected");
    expect((await db.select().from(calls).where(eq(calls.wacid, "f1")))[0].status).toBe("failed");
    expect((await db.select().from(calls).where(eq(calls.wacid, "n1")))[0].status).toBe("missed");
  });
  it("connect tras terminate no revive ringing", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "ord", direction: "in", event: "terminate", durationSec: 0, ts: new Date(2000) });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "ord", direction: "in", event: "connect", ts: new Date(1000) });
    expect((await db.select().from(calls).where(eq(calls.wacid, "ord")))[0].status).toBe("missed");
  });
  it("getRingingCalls solo trae entrantes en ringing dentro de la ventana", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const now = new Date();
    const old = new Date(now.getTime() - 5 * 60_000);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "live", direction: "in", event: "connect", ts: now });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57301", wacid: "stale", direction: "in", event: "connect", ts: old });
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57302", wacid: "done", direction: "in", event: "terminate", durationSec: 9, ts: now });
    const ringing = await getRingingCalls(db, "o1");
    const liveId = (await db.select().from(calls).where(eq(calls.wacid, "live")))[0].id;
    expect(ringing.map((r) => r.id)).toEqual([liveId]);
  });
  it("markCallConnected pone connected + answeredAt; terminate luego cierra a completed", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "cc", direction: "in", event: "connect", ts: new Date(1000) });
    const before = (await db.select().from(calls).where(eq(calls.wacid, "cc")))[0];
    await markCallConnected(db, "o1", before.id, new Date(3000));
    let row = await getCallById(db, "o1", before.id);
    expect(row?.status).toBe("connected");
    expect(row?.answeredAt?.getTime()).toBe(3000);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "cc", direction: "in", event: "terminate", durationSec: 12, ts: new Date(5000) });
    row = await getCallById(db, "o1", before.id);
    expect(row?.status).toBe("completed");
  });
  it("connect duplicado no degrada un connected", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "dup", direction: "in", event: "connect", ts: new Date(1000) });
    const id = (await db.select().from(calls).where(eq(calls.wacid, "dup")))[0].id;
    await markCallConnected(db, "o1", id, new Date(3000));
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "dup", direction: "in", event: "connect", ts: new Date(4000) });
    expect((await getCallById(db, "o1", id))?.status).toBe("connected");
  });
  it("markCallRejected pone rejected", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "rj", direction: "in", event: "connect", ts: new Date(1000) });
    const id = (await db.select().from(calls).where(eq(calls.wacid, "rj")))[0].id;
    await markCallRejected(db, "o1", id);
    expect((await getCallById(db, "o1", id))?.status).toBe("rejected");
  });
});
