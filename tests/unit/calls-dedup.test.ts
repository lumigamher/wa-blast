import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { calls, organization, conversations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { recordCallEvent } from "@/lib/calls/store";
import type { DB } from "@/lib/db/client";

const testOrgId = "test-org";
const testConvId = "test-conv";
const testPhone = "+123456789";
const testWacid = "test-wacid-1";

async function seed(db: DB) {
  await db.insert(organization).values({
    id: testOrgId,
    name: "Test Org",
    slug: "test-org",
    createdAt: new Date(),
  });
  await db.insert(conversations).values({
    id: testConvId,
    orgId: testOrgId,
    phone: testPhone,
    lastMessageAt: new Date(),
    unreadCount: 0,
    createdAt: new Date(),
  });
}

describe("calls-dedup: recordCallEvent idempotency", () => {
  it("should create one record for concurrent webhooks with same wacid", async () => {
    const { db } = makeTestDb();
    await seed(db);

    // Two "connect" events for the same wacid, sent concurrently
    const event1 = {
      orgId: testOrgId,
      conversationId: testConvId,
      phone: testPhone,
      wacid: testWacid,
      direction: "in" as const,
      event: "connect" as const,
      ts: new Date(),
    };

    const event2 = {
      ...event1,
      ts: new Date(Date.now() + 1),
    };

    // Fire both concurrently (as would happen with simultaneous webhooks)
    await Promise.all([
      recordCallEvent(db, event1),
      recordCallEvent(db, event2),
    ]);

    // Verify only 1 row exists for this (orgId, wacid)
    const rows = await db
      .select()
      .from(calls)
      .where(and(eq(calls.orgId, testOrgId), eq(calls.wacid, testWacid)));

    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("ringing"); // "connect" → "ringing"
  });

  it("should update existing record on second call", async () => {
    const { db } = makeTestDb();
    await seed(db);

    const connectEvent = {
      orgId: testOrgId,
      conversationId: testConvId,
      phone: testPhone,
      wacid: testWacid,
      direction: "in" as const,
      event: "connect" as const,
      ts: new Date(),
    };

    // First call: create
    await recordCallEvent(db, connectEvent);

    // Second call: same wacid but terminate
    const terminateEvent = {
      ...connectEvent,
      event: "terminate" as const,
      status: "completed",
      durationSec: 60,
      ts: new Date(Date.now() + 5000),
    };

    await recordCallEvent(db, terminateEvent);

    // Should still be 1 row, status changed to "completed"
    const rows = await db
      .select()
      .from(calls)
      .where(and(eq(calls.orgId, testOrgId), eq(calls.wacid, testWacid)));

    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].durationSec).toBe(60);
  });
});
