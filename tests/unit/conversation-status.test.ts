import { describe, expect, it } from "vitest";
import type { DB } from "@/lib/db/client";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getOrCreateConversation, listConversations, setConversationStatus } from "@/lib/inbox/store";

async function seed(db: DB, orgId = "o1") {
  await db.insert(organization).values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
  return orgId;
}

describe("conversation status", () => {
  it("crear conversación con status open por defecto", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const conv = await getOrCreateConversation(db, "o1", "+1234567890", new Date(), "Test User");
    expect(conv.status).toBe("open");
  });

  it("setConversationStatus resuelve una conversación", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const conv = await getOrCreateConversation(db, "o1", "+1234567890", new Date(), "Test User");
    await setConversationStatus(db, "o1", conv.id, "resolved");
    const conversations = await listConversations(db, "o1", { status: "all" });
    const updated = conversations.find((c) => c.id === conv.id);
    expect(updated?.status).toBe("resolved");
  });

  it("setConversationStatus reabre una conversación", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const conv = await getOrCreateConversation(db, "o1", "+1234567890", new Date());
    await setConversationStatus(db, "o1", conv.id, "resolved");
    await setConversationStatus(db, "o1", conv.id, "open");
    const conversations = await listConversations(db, "o1", { status: "all" });
    const updated = conversations.find((c) => c.id === conv.id);
    expect(updated?.status).toBe("open");
  });

  it("listConversations filtra por status=open", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c1 = await getOrCreateConversation(db, "o1", "+1111111111", new Date());
    const _c2 = await getOrCreateConversation(db, "o1", "+2222222222", new Date());
    await setConversationStatus(db, "o1", c1.id, "resolved");

    const open = await listConversations(db, "o1", { status: "open" });
    expect(open.length).toBe(1);
    expect(open[0].id).toBe(_c2!.id);
  });

  it("listConversations filtra por status=resolved", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c1 = await getOrCreateConversation(db, "o1", "+1111111111", new Date());
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _c2 = await getOrCreateConversation(db, "o1", "+2222222222", new Date());
    await setConversationStatus(db, "o1", c1.id, "resolved");

    const resolved = await listConversations(db, "o1", { status: "resolved" });
    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe(c1!.id);
  });

  it("listConversations status=all retorna todas", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const c1 = await getOrCreateConversation(db, "o1", "+1111111111", new Date());
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _c2 = await getOrCreateConversation(db, "o1", "+2222222222", new Date());
    await setConversationStatus(db, "o1", c1.id, "resolved");

    const all = await listConversations(db, "o1", { status: "all" });
    expect(all.length).toBe(2);
  });

  it("listConversations sin status param por defecto filtra open", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const _c1 = await getOrCreateConversation(db, "o1", "+1111111111", new Date());
    const c2 = await getOrCreateConversation(db, "o1", "+2222222222", new Date());
    await setConversationStatus(db, "o1", _c1.id, "resolved");

    const defaultList = await listConversations(db, "o1", {});
    expect(defaultList.length).toBe(1);
    expect(defaultList[0].id).toBe(c2.id);
  });

  it("setConversationStatus respeta aislamiento por org", async () => {
    const { db } = makeTestDb();
    await seed(db, "o1");
    await seed(db, "o2");
    const c1 = await getOrCreateConversation(db, "o1", "+1111111111", new Date());
    const _c2 = await getOrCreateConversation(db, "o2", "+1111111111", new Date());

    // Intentar resolver c1 con org o2 (debe fallar silenciosamente)
    await setConversationStatus(db, "o2", c1!.id, "resolved");

    const c1Still = (await listConversations(db, "o1", { status: "all" })).find((c) => c.id === c1!.id);
    expect(c1Still?.status).toBe("open");

    const c2Still = (await listConversations(db, "o2", { status: "all" })).find((c) => c.id === _c2!.id);
    expect(c2Still?.status).toBe("open");
  });

  it("listConversations incluye status en resultado", async () => {
    const { db } = makeTestDb();
    await seed(db);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _c1 = await getOrCreateConversation(db, "o1", "+1234567890", new Date());
    const list = await listConversations(db, "o1", { status: "all" });
    expect(list[0]).toHaveProperty("status");
    expect(list[0].status).toBe("open");
  });
});
