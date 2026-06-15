import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messages, organization } from "@/lib/db/schema";
import { getThread } from "@/lib/inbox/store";
import type { DB } from "@/lib/db/client";

async function seed(db: DB) {
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

describe("reply quote", () => {
  it("resuelve el mensaje citado en getThread", async () => {
    const { db } = makeTestDb();
    await seed(db);

    const ts = new Date();

    // Mensaje A (original) que será citado
    await db.insert(messages).values({
      id: "msg.A",
      conversationId: "c1",
      orgId: "o1",
      direction: "in",
      wamid: "wamid.A",
      type: "text",
      body: "Hola, ¿cómo estás?",
      mediaId: null,
      status: null,
      errorMessage: null,
      payloadJson: null,
      createdAt: ts,
    });

    // Mensaje B (respuesta) que cita a A
    await db.insert(messages).values({
      id: "msg.B",
      conversationId: "c1",
      orgId: "o1",
      direction: "in",
      wamid: "wamid.B",
      type: "text",
      body: "Bien, ¿y tú?",
      mediaId: null,
      status: null,
      errorMessage: null,
      payloadJson: null,
      replyToWamid: "wamid.A", // Cita a A
      createdAt: new Date(ts.getTime() + 1000),
    });

    const thread = await getThread(db, "o1", "c1");
    expect(thread).not.toBeNull();
    expect(thread!.messages).toHaveLength(2);

    // El mensaje B debe tener la cita resuelta
    const msgB = thread!.messages[1];
    expect(msgB.id).toBe("msg.B");
    expect(msgB.replyToWamid).toBe("wamid.A");

    // Verificar que la cita está disponible en el thread
    expect(thread!.quotes).toBeDefined();
    const quoteB = thread!.quotes["msg.B"];
    expect(quoteB).toBeDefined();
    expect(quoteB.label).toContain("Hola");
    expect(quoteB.direction).toBe("in");
  });

  it("resuelve cita a mensaje vacío como 'Mensaje'", async () => {
    const { db } = makeTestDb();
    await seed(db);

    const ts = new Date();

    // Mensaje A sin body
    await db.insert(messages).values({
      id: "msg.A",
      conversationId: "c1",
      orgId: "o1",
      direction: "out",
      wamid: "wamid.A",
      type: "image",
      body: null,
      mediaId: "media.1",
      status: "sent",
      errorMessage: null,
      payloadJson: null,
      createdAt: ts,
    });

    // Mensaje B cita a A
    await db.insert(messages).values({
      id: "msg.B",
      conversationId: "c1",
      orgId: "o1",
      direction: "in",
      wamid: "wamid.B",
      type: "text",
      body: "Interesante",
      mediaId: null,
      status: null,
      errorMessage: null,
      payloadJson: null,
      replyToWamid: "wamid.A",
      createdAt: new Date(ts.getTime() + 1000),
    });

    const thread = await getThread(db, "o1", "c1");
    const quoteB = thread!.quotes["msg.B"];
    expect(quoteB.label).toBe("📷 Imagen");
  });

  it("trunca textos largos en la cita", async () => {
    const { db } = makeTestDb();
    await seed(db);

    const ts = new Date();
    const longText = "a".repeat(100);

    // Mensaje A con texto largo
    await db.insert(messages).values({
      id: "msg.A",
      conversationId: "c1",
      orgId: "o1",
      direction: "in",
      wamid: "wamid.A",
      type: "text",
      body: longText,
      mediaId: null,
      status: null,
      errorMessage: null,
      payloadJson: null,
      createdAt: ts,
    });

    // Mensaje B cita a A
    await db.insert(messages).values({
      id: "msg.B",
      conversationId: "c1",
      orgId: "o1",
      direction: "out",
      wamid: "wamid.B",
      type: "text",
      body: "Entendido",
      mediaId: null,
      status: "sent",
      errorMessage: null,
      payloadJson: null,
      replyToWamid: "wamid.A",
      createdAt: new Date(ts.getTime() + 1000),
    });

    const thread = await getThread(db, "o1", "c1");
    const quoteB = thread!.quotes["msg.B"];
    expect(quoteB.label.length).toBeLessThanOrEqual(65);
  });

  it("devuelve null para cita a mensaje no encontrado", async () => {
    const { db } = makeTestDb();
    await seed(db);

    const ts = new Date();

    // Mensaje B cita a A (que no existe)
    await db.insert(messages).values({
      id: "msg.B",
      conversationId: "c1",
      orgId: "o1",
      direction: "in",
      wamid: "wamid.B",
      type: "text",
      body: "Respuesta",
      mediaId: null,
      status: null,
      errorMessage: null,
      payloadJson: null,
      replyToWamid: "wamid.MISSING",
      createdAt: ts,
    });

    const thread = await getThread(db, "o1", "c1");
    const quoteB = thread!.quotes["msg.B"];
    // Si no existe, la cita debería mostrar "Mensaje"
    expect(quoteB.label).toBe("Mensaje");
  });
});
