import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, organization } from "@/lib/db/schema";
import {
  getOrCreateConversation, recordInboundMessage, recordOutboundMessage,
  updateMessageStatusByWamid, markConversationRead, listConversations, getThread,
} from "@/lib/inbox/store";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(contacts).values({ id: "c1", orgId: "o1", phone: "+573001112233", name: "Ana", createdAt: new Date(), updatedAt: new Date() });
}

describe("inbox store", () => {
  it("inbound crea conversación, suma unread, ancla lastIncomingAt y vincula contacto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const ts = new Date();
    await recordInboundMessage(db, { orgId: "o1", phone: "+573001112233", wamid: "w1", parsed: { type: "text", body: "hola", mediaId: null, payloadJson: null }, ts });
    const convs = await listConversations(db, "o1", {});
    expect(convs.length).toBe(1);
    expect(convs[0].unreadCount).toBe(1);
    expect(convs[0].contactName).toBe("Ana");
    // SQLite stores timestamps as seconds, so compare at second precision
    expect(Math.floor((convs[0].lastIncomingAt?.getTime() ?? 0) / 1000)).toBe(Math.floor(ts.getTime() / 1000));
    expect(convs[0].preview).toBe("hola");
  });

  it("inbound duplicado por wamid NO duplica mensaje", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const ts = new Date();
    const input = { orgId: "o1", phone: "+573001112233", wamid: "dup", parsed: { type: "text", body: "x", mediaId: null, payloadJson: null }, ts };
    await recordInboundMessage(db, input);
    await recordInboundMessage(db, input);
    const { messages: msgs } = (await getThread(db, "o1", (await listConversations(db, "o1", {}))[0].id))!;
    expect(msgs.length).toBe(1);
  });

  it("outbound + status por wamid", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const conv = await getOrCreateConversation(db, "o1", "+573001112233", new Date());
    await recordOutboundMessage(db, { orgId: "o1", conversationId: conv.id, wamid: "out1", type: "text", body: "respuesta" });
    await updateMessageStatusByWamid(db, "out1", "delivered", undefined);
    const t = (await getThread(db, "o1", conv.id))!;
    expect(t.messages[0].status).toBe("delivered");
    await updateMessageStatusByWamid(db, "out1", "failed", "boom");
    expect((await getThread(db, "o1", conv.id))!.messages[0].errorMessage).toBe("boom");
  });

  it("markConversationRead resetea unread", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordInboundMessage(db, { orgId: "o1", phone: "+573001112233", wamid: "w2", parsed: { type: "text", body: "a", mediaId: null, payloadJson: null }, ts: new Date() });
    const conv = (await listConversations(db, "o1", {}))[0];
    await markConversationRead(db, "o1", conv.id);
    expect((await listConversations(db, "o1", {}))[0].unreadCount).toBe(0);
  });

  it("listConversations filtra por org, busca por nombre/teléfono y filtra unread", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await recordInboundMessage(db, { orgId: "o1", phone: "+573001112233", wamid: "w3", parsed: { type: "text", body: "a", mediaId: null, payloadJson: null }, ts: new Date() });
    await recordInboundMessage(db, { orgId: "o2", phone: "+573009998877", wamid: "w4", parsed: { type: "text", body: "b", mediaId: null, payloadJson: null }, ts: new Date() });
    expect((await listConversations(db, "o1", {})).length).toBe(1);
    expect((await listConversations(db, "o1", { q: "ana" })).length).toBe(1);
    expect((await listConversations(db, "o1", { q: "9998877" })).length).toBe(0);
    const conv = (await listConversations(db, "o1", {}))[0];
    await markConversationRead(db, "o1", conv.id);
    expect((await listConversations(db, "o1", { unreadOnly: true })).length).toBe(0);
  });

  it("getThread de otra org devuelve null (aislamiento)", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordInboundMessage(db, { orgId: "o1", phone: "+573001112233", wamid: "w5", parsed: { type: "text", body: "a", mediaId: null, payloadJson: null }, ts: new Date() });
    const conv = (await listConversations(db, "o1", {}))[0];
    expect(await getThread(db, "otra-org", conv.id)).toBeNull();
  });
});
