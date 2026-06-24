import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import {
  createLabel,
  listLabels,
  deleteLabel,
  getConversationLabels,
  setConversationLabels,
  labelsByConversation,
} from "./labels";

async function seed(db: any, orgId = "o1") {
  await db
    .insert(organization)
    .values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() })
    .onConflictDoNothing();
  const convId = "c1";
  await db
    .insert(conversations)
    .values({
      id: convId,
      orgId,
      phone: "57300",
      status: "open",
      unreadCount: 0,
      lastMessageAt: new Date(),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return convId;
}

describe("inbox labels", () => {
  it("crea, lista y asigna etiquetas a una conversación", async () => {
    const { db } = makeTestDb();
    const convId = await seed(db);
    const a = await createLabel(db, "o1", { name: "Pagó", color: "#10b981" });
    const b = await createLabel(db, "o1", {
      name: "Mayorista",
      color: "#f59e0b",
    });
    expect((await listLabels(db, "o1")).length).toBe(2);

    await setConversationLabels(db, "o1", convId, [a, b]);
    expect(
      (await getConversationLabels(db, "o1", convId))
        .map((l) => l.id)
        .sort()
    ).toEqual([a, b].sort());

    await setConversationLabels(db, "o1", convId, [a]); // reemplaza el set
    expect(
      (await getConversationLabels(db, "o1", convId)).map((l) => l.name)
    ).toEqual(["Pagó"]);
  });

  it("dedupe por nombre (case-insensitive) en la org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await createLabel(db, "o1", { name: "VIP", color: "#000" });
    await expect(
      createLabel(db, "o1", { name: "vip", color: "#111" })
    ).rejects.toThrow();
  });

  it("labelsByConversation devuelve map sin N+1 y scoped por org", async () => {
    const { db } = makeTestDb();
    const convId = await seed(db);
    const a = await createLabel(db, "o1", { name: "X", color: "#000" });
    await setConversationLabels(db, "o1", convId, [a]);
    const map = await labelsByConversation(db, "o1", [convId]);
    expect(map[convId]?.[0]?.name).toBe("X");
  });

  it("deleteLabel quita la etiqueta del catálogo y de las conversaciones", async () => {
    const { db } = makeTestDb();
    const convId = await seed(db);
    const a = await createLabel(db, "o1", { name: "Tmp", color: "#000" });
    await setConversationLabels(db, "o1", convId, [a]);
    await deleteLabel(db, "o1", a);
    expect((await listLabels(db, "o1")).length).toBe(0);
    expect((await getConversationLabels(db, "o1", convId)).length).toBe(0);
  });
});
