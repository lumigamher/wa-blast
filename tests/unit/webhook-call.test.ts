import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { calls, organization } from "@/lib/db/schema";
import { handleCallEvent } from "@/lib/meta/webhook-handlers";
import type { DB } from "@/lib/db/client";

async function seed(db: DB) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

interface CallPayload {
  id: string;
  from?: string;
  to?: string;
  event: string;
  timestamp?: string;
  direction?: string;
  status?: string;
  duration?: number;
  session?: { sdp?: string; sdp_type?: string };
}

describe("handleCallEvent", () => {
  it("crea conversación + registro de llamada entrante", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload: CallPayload = {
      id: "wacid.X",
      from: "57300",
      event: "connect",
      timestamp: "1700000000",
      direction: "USER_INITIATED",
    };
    await handleCallEvent(db, "o1", payload);
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.X"));
    expect(rows.length).toBe(1);
    expect(rows[0].direction).toBe("in");
    expect(rows[0].status).toBe("ringing");
    expect(rows[0].phone).toBe("+57300");
  });

  it("BUSINESS_INITIATED usa 'to' y direction out", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload: CallPayload = {
      id: "wacid.Y",
      to: "57301",
      event: "terminate",
      timestamp: "1700000000",
      direction: "BUSINESS_INITIATED",
      duration: 20,
    };
    await handleCallEvent(db, "o1", payload);
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.Y"));
    expect(rows[0].direction).toBe("out");
    expect(rows[0].phone).toBe("+57301");
    expect(rows[0].status).toBe("completed");
  });

  it("captura session.sdp del connect", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const payload: CallPayload = {
      id: "wacid.Z",
      from: "57300",
      event: "connect",
      timestamp: "1700000000",
      direction: "USER_INITIATED",
      session: { sdp: "v=0 offer", sdp_type: "offer" },
    };
    await handleCallEvent(db, "o1", payload);
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.Z"));
    expect(rows[0].sdp).toBe("v=0 offer");
    expect(rows[0].sdpType).toBe("offer");
  });

  it("answer de una llamada saliente persiste answerSdp", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const { createOutboundCall } = await import("@/lib/calls/store");
    const { getOrCreateConversation } = await import("@/lib/inbox/store");
    const conv = await getOrCreateConversation(db, "o1", "+57305", new Date());
    await createOutboundCall(db, { orgId: "o1", conversationId: conv.id, phone: "+57305", wacid: "wacid.OUT" });
    const payload: CallPayload = {
      id: "wacid.OUT",
      to: "57305",
      event: "connect",
      direction: "BUSINESS_INITIATED",
      session: { sdp: "v=0 answer-remoto", sdp_type: "answer" },
    };
    await handleCallEvent(db, "o1", payload);
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.OUT"));
    expect(rows[0].answerSdp).toBe("v=0 answer-remoto");
  });
});
