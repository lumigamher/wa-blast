import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, contacts, conversations, messageEvents, messages, organization, user } from "@/lib/db/schema";
import * as store from "@/lib/inbox/store";
import { maybeDispatchAgentTurn } from "@/lib/agent/dispatch";
import { handleInboundMessage, handleStatusEvent } from "./webhook-handlers";

vi.mock("@/lib/agent/dispatch", () => ({ maybeDispatchAgentTurn: vi.fn(async () => {}) }));
vi.mock("@/lib/inbox/store", async (orig) => {
  const actual = await orig<typeof import("@/lib/inbox/store")>();
  return {
    ...actual,
    recordInboundMessage: vi.fn(actual.recordInboundMessage),
    updateMessageStatusByWamid: vi.fn(actual.updateMessageStatusByWamid),
  };
});

const PHONE = "+573001112233";
const identity = { phone: PHONE };

function msg(id: string) {
  return { from: "573001112233", id, timestamp: "1786000000", type: "text", text: { body: "hola" } };
}

async function seed() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(user).values({ id: "u1", email: "u1@x.co", createdAt: new Date(), updatedAt: new Date() });
  await db.insert(campaigns).values({
    id: "c1", orgId: "o1", name: "c", templateName: "t", templateLanguage: "es",
    source: "manual", status: "sent", createdBy: "u1", createdAt: new Date(),
  });
  await db.insert(campaignRecipients).values({
    campaignId: "c1", phone: PHONE, status: "sent", wamid: "wamid.out", sentAt: new Date(),
  });
  return db;
}

const camp = async (db: Awaited<ReturnType<typeof seed>>) =>
  (await db.select().from(campaigns).where(eq(campaigns.id, "c1")))[0];

beforeEach(() => vi.clearAllMocks());

describe("handleInboundMessage: reentregas", () => {
  it("reentrega tras éxito: 1 mensaje, agente 1 vez, replied +1 una sola vez", async () => {
    const db = await seed();
    await handleInboundMessage(db, "o1", msg("wamid.in1"), [], "Juan", identity);
    await handleInboundMessage(db, "o1", msg("wamid.in1"), [], "Juan", identity);
    expect(await db.select().from(messages).where(eq(messages.wamid, "wamid.in1"))).toHaveLength(1);
    expect(maybeDispatchAgentTurn).toHaveBeenCalledTimes(1);
    expect((await camp(db)).replied).toBe(1);
  });

  it("si guardar el mensaje falla, la reentrega lo procesa completo", async () => {
    const db = await seed();
    vi.mocked(store.recordInboundMessage).mockRejectedValueOnce(new Error("SQLITE_BUSY"));
    await expect(handleInboundMessage(db, "o1", msg("wamid.in2"), [], "Juan", identity)).rejects.toThrow("SQLITE_BUSY");
    await handleInboundMessage(db, "o1", msg("wamid.in2"), [], "Juan", identity);
    expect(await db.select().from(messages).where(eq(messages.wamid, "wamid.in2"))).toHaveLength(1);
    expect(maybeDispatchAgentTurn).toHaveBeenCalledTimes(1);
    expect((await camp(db)).replied).toBe(1);
  });
});

describe("handleInboundMessage: identidad mixta (teléfono + BSUID)", () => {
  const both = { phone: PHONE, bsuid: "US.123" };

  it("replied: fila de campaña solo-BSUID + inbound con teléfono y BSUID suma +1", async () => {
    const db = await seed();
    await db.delete(campaignRecipients);
    await db.insert(campaignRecipients).values({
      campaignId: "c1", phone: null, bsuid: "US.123", status: "sent", wamid: "wamid.out", sentAt: new Date(),
    });
    await handleInboundMessage(db, "o1", msg("wamid.mix1"), [], "Juan", both);
    expect((await camp(db)).replied).toBe(1);
  });

  it("opt-out: contacto solo-teléfono que escribe BAJA con BSUID queda dado de baja", async () => {
    const db = await seed();
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: PHONE, createdAt: new Date(), updatedAt: new Date() } as never);
    await handleInboundMessage(db, "o1", { ...msg("wamid.mix2"), text: { body: "BAJA" } }, ["BAJA"], "Juan", both);
    const [c] = await db.select().from(contacts).where(eq(contacts.id, "ct1"));
    expect(c.optOutAt).not.toBeNull();
  });
});

describe("handleInboundMessage: fallos tras guardar y concurrencia", () => {
  it("falla el update de replied tras guardar el mensaje: la reentrega completa contador y despacho una vez", async () => {
    const db = await seed();
    const spy = vi.spyOn(db, "update");
    // el primer update tras guardar (conversations) lo dejamos pasar; hacemos fallar el de campaigns
    spy.mockImplementation(((table: unknown) => {
      if (table === campaigns) {
        spy.mockRestore();
        throw new Error("SQLITE_BUSY");
      }
      return (Object.getPrototypeOf(db).update as (t: unknown) => unknown).call(db, table);
    }) as never);
    await expect(handleInboundMessage(db, "o1", msg("wamid.in3"), [], "Juan", identity)).rejects.toThrow("SQLITE_BUSY");
    expect(maybeDispatchAgentTurn).toHaveBeenCalledTimes(0);
    await handleInboundMessage(db, "o1", msg("wamid.in3"), [], "Juan", identity);
    await handleInboundMessage(db, "o1", msg("wamid.in3"), [], "Juan", identity);
    expect(await db.select().from(messages).where(eq(messages.wamid, "wamid.in3"))).toHaveLength(1);
    expect(maybeDispatchAgentTurn).toHaveBeenCalledTimes(1);
    expect((await camp(db)).replied).toBe(1);
  });

  it("dos procesamientos concurrentes: un mensaje, replied +1, un despacho", async () => {
    const db = await seed();
    await Promise.all([
      handleInboundMessage(db, "o1", msg("wamid.in4"), [], "Juan", identity),
      handleInboundMessage(db, "o1", msg("wamid.in4"), [], "Juan", identity),
    ]);
    expect(await db.select().from(messages).where(eq(messages.wamid, "wamid.in4"))).toHaveLength(1);
    expect(maybeDispatchAgentTurn).toHaveBeenCalledTimes(1);
    expect((await camp(db)).replied).toBe(1);
  });
});

describe("handleInboundMessage: atomicidad y liberación del gate", () => {
  it("falla el update de conversations tras el insert: la reentrega deja 1 mensaje, lastIncomingAt y unread +1", async () => {
    const db = await seed();
    const raw = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
    raw.exec("CREATE TRIGGER boom BEFORE UPDATE ON conversations BEGIN SELECT RAISE(ABORT, 'SQLITE_BUSY'); END;");
    await expect(handleInboundMessage(db, "o1", msg("wamid.in5"), [], "Juan", identity)).rejects.toThrow("SQLITE_BUSY");
    expect(await db.select().from(messages).where(eq(messages.wamid, "wamid.in5"))).toHaveLength(0);
    raw.exec("DROP TRIGGER boom;");
    await handleInboundMessage(db, "o1", msg("wamid.in5"), [], "Juan", identity);
    await handleInboundMessage(db, "o1", msg("wamid.in5"), [], "Juan", identity);
    expect(await db.select().from(messages).where(eq(messages.wamid, "wamid.in5"))).toHaveLength(1);
    const [conv] = await db.select().from(conversations);
    expect(conv.unreadCount).toBe(1);
    expect(conv.lastIncomingAt).not.toBeNull();
    expect(maybeDispatchAgentTurn).toHaveBeenCalledTimes(1);
  });

  it("si liberar el claim también falla, se propaga el error ORIGINAL", async () => {
    const db = await seed();
    vi.mocked(store.recordInboundMessage).mockRejectedValueOnce(new Error("original"));
    vi.spyOn(db, "delete").mockImplementationOnce((() => {
      throw new Error("delete fallo");
    }) as never);
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    await expect(handleInboundMessage(db, "o1", msg("wamid.in6"), [], "Juan", identity)).rejects.toThrow("original");
  });
});

describe("handleStatusEvent: reentregas", () => {
  const status = { id: "wamid.out", status: "delivered" as const, timestamp: "1786000000" };

  it("si el efecto falla, la reentrega aplica el status una sola vez", async () => {
    const db = await seed();
    vi.mocked(store.updateMessageStatusByWamid).mockRejectedValueOnce(new Error("SQLITE_BUSY"));
    await expect(handleStatusEvent(db, "o1", status)).rejects.toThrow("SQLITE_BUSY");
    await handleStatusEvent(db, "o1", status);
    await handleStatusEvent(db, "o1", status); // reentrega tras éxito
    expect((await camp(db)).delivered).toBe(1);
    const [rec] = await db.select().from(campaignRecipients).where(eq(campaignRecipients.wamid, "wamid.out"));
    expect(rec.status).toBe("delivered");
    const evs = await db.select().from(messageEvents).where(and(eq(messageEvents.wamid, "wamid.out"), eq(messageEvents.event, "delivered")));
    expect(evs).toHaveLength(1);
  });

  it("dos status concurrentes: contador +1", async () => {
    const db = await seed();
    await Promise.all([handleStatusEvent(db, "o1", status), handleStatusEvent(db, "o1", status)]);
    expect((await camp(db)).delivered).toBe(1);
  });
});
