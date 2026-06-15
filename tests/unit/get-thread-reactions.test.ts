import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messages, organization } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";
import { getThread } from "@/lib/inbox/store";
import { upsertReaction } from "@/lib/inbox/reactions";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({
    id: "c1",
    orgId: "o1",
    phone: "+57300",
    lastMessageAt: new Date(),
    unreadCount: 0,
    createdAt: new Date(),
  });
}

describe("getThread devuelve reacciones", () => {
  it("incluye reacciones vinculadas a mensajes en la respuesta", async () => {
    const { db } = makeTestDb();
    await seed(db);

    // Insertar un mensaje saliente con wamid
    const now = new Date();
    await db.insert(messages).values({
      id: randomUUID(),
      conversationId: "c1",
      orgId: "o1",
      direction: "out",
      wamid: "wamid.out1",
      type: "text",
      body: "Mensaje saliente",
      mediaId: null,
      status: "sent",
      errorMessage: null,
      payloadJson: null,
      createdAt: now,
    });

    // Insertar una reacción al mensaje
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.out1",
      direction: "in",
      emoji: "👍",
    });

    // Obtener el thread
    const thread = await getThread(db, "o1", "c1");
    expect(thread).not.toBeNull();
    expect(thread?.messages.length).toBe(1);
    expect(thread?.reactions).toBeDefined();
    expect(thread?.reactions["wamid.out1"]).toBeDefined();
    expect(thread?.reactions["wamid.out1"].length).toBe(1);
    expect(thread?.reactions["wamid.out1"][0].emoji).toBe("👍");
    expect(thread?.reactions["wamid.out1"][0].direction).toBe("in");
  });

  it("devuelve reacciones vacías cuando no hay reacciones", async () => {
    const { db } = makeTestDb();
    await seed(db);

    // Insertar un mensaje sin reacciones
    const now = new Date();
    await db.insert(messages).values({
      id: randomUUID(),
      conversationId: "c1",
      orgId: "o1",
      direction: "out",
      wamid: "wamid.out2",
      type: "text",
      body: "Mensaje sin reacciones",
      mediaId: null,
      status: "sent",
      errorMessage: null,
      payloadJson: null,
      createdAt: now,
    });

    // Obtener el thread
    const thread = await getThread(db, "o1", "c1");
    expect(thread).not.toBeNull();
    expect(thread?.reactions).toBeDefined();
    expect(thread?.reactions["wamid.out2"]).toBeUndefined();
  });

  it("agrupa múltiples reacciones por wamid", async () => {
    const { db } = makeTestDb();
    await seed(db);

    // Insertar dos mensajes
    const now = new Date();
    await db.insert(messages).values([
      {
        id: randomUUID(),
        conversationId: "c1",
        orgId: "o1",
        direction: "out",
        wamid: "wamid.out3",
        type: "text",
        body: "Mensaje 1",
        mediaId: null,
        status: "sent",
        errorMessage: null,
        payloadJson: null,
        createdAt: now,
      },
      {
        id: randomUUID(),
        conversationId: "c1",
        orgId: "o1",
        direction: "out",
        wamid: "wamid.out4",
        type: "text",
        body: "Mensaje 2",
        mediaId: null,
        status: "sent",
        errorMessage: null,
        payloadJson: null,
        createdAt: now,
      },
    ]);

    // Insertar reacciones
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.out3",
      direction: "in",
      emoji: "👍",
    });
    await upsertReaction(db, {
      orgId: "o1",
      conversationId: "c1",
      targetWamid: "wamid.out4",
      direction: "out",
      emoji: "❤️",
    });

    // Obtener el thread
    const thread = await getThread(db, "o1", "c1");
    expect(thread?.reactions["wamid.out3"]).toHaveLength(1);
    expect(thread?.reactions["wamid.out4"]).toHaveLength(1);
    expect(thread?.reactions["wamid.out3"][0].emoji).toBe("👍");
    expect(thread?.reactions["wamid.out4"][0].emoji).toBe("❤️");
  });
});
