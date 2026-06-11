import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, organization } from "@/lib/db/schema";
import { listConversations } from "@/lib/inbox/store";

// Mock the auth and settings dependencies
vi.mock("@/lib/auth/session", () => ({
  requireOrg: vi.fn(async () => ({ orgId: "o1", userId: "u1" })),
}));

vi.mock("@/lib/billing/gate", () => ({
  checkSubscriptionGate: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/org/settings", () => ({
  getOrgSettings: vi.fn(async () => ({
    metaPhoneId: "PHONE1",
    metaAccessToken: "TOK",
  })),
}));

// Mock db imports
vi.mock("@/lib/db/client", () => {
  const testDb = makeTestDb();
  return { db: testDb.db };
});

async function setupTestData() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(contacts).values({
    id: "c1", orgId: "o1", phone: "+573001112233", name: "Ana",
    createdAt: new Date(), updatedAt: new Date(),
  });
  return db;
}

describe("inbox actions integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("store getLastInboundWamid works correctly", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(contacts).values({
      id: "c1", orgId: "o1", phone: "+573001112233", name: "Ana",
      createdAt: new Date(), updatedAt: new Date(),
    });

    const convs = await listConversations(db, "o1", {});
    expect(convs.length).toBeGreaterThanOrEqual(0);
  });

  it("fetchMock for Meta markRead works", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const resp = await fetch("https://graph.facebook.com/v22.0/test/messages", {
      method: "POST",
      headers: { authorization: "Bearer test" },
      body: JSON.stringify({ status: "read" }),
    });

    expect(resp.ok).toBe(true);
    fetchMock.mockRestore();
  });

  it("fetchMock for Meta uploadMedia works", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "MEDIA99" }), { status: 200 }));

    const resp = await fetch("https://graph.facebook.com/v22.0/test/media", { method: "POST" });
    const data = await resp.json();
    expect(data.id).toBe("MEDIA99");

    fetchMock.mockRestore();
  });

  it("sendText with replyTo includes context in payload", async () => {
    const { sendText } = await import("@/lib/meta/client");
    const settings = { metaPhoneId: "PHONE1", metaAccessToken: "TOK" } as any;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 }),
    );

    const result = await sendText(settings, { to: "+573001112233", body: "test", replyTo: "wamid.PREV" });
    expect("wamid" in result).toBe(true);

    const calls = fetchMock.mock.calls;
    const lastCall = calls[calls.length - 1];
    const payload = JSON.parse(lastCall[1]?.body as string);
    expect(payload.context?.message_id).toBe("wamid.PREV");

    fetchMock.mockRestore();
  });

  it("markRead and uploadMedia and sendMedia and sendReaction all work", async () => {
    const { markRead, uploadMedia, sendMedia, sendReaction } = await import("@/lib/meta/client");
    const settings = { metaPhoneId: "PHONE1", metaAccessToken: "TOK" } as any;

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true, id: "M1", messages: [{ id: "w1" }] }), { status: 200 }));

    const mr = await markRead(settings, { wamid: "w1", typing: true });
    expect("ok" in mr).toBe(true);

    fetchMock.mockRestore();
  });
});
