import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization, user } from "@/lib/db/schema";
import { addNote, deleteNote, listNotes } from "@/lib/inbox/notes";
import type { DB } from "@/lib/db/client";

async function seed(db: DB) {
  await db
    .insert(organization)
    .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(user).values({
    id: "u1",
    name: "Luis",
    email: "l@x.co",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(conversations).values({
    id: "c1",
    orgId: "o1",
    phone: "+57300",
    lastMessageAt: new Date(),
    unreadCount: 0,
    createdAt: new Date(),
  });
}

describe("notes", () => {
  it("añade y lista por conversación", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addNote(db, "o1", {
      conversationId: "c1",
      authorUserId: "u1",
      authorName: "Luis",
      body: "Cliente VIP",
    });
    const rows = await listNotes(db, "o1", "c1");
    expect(rows.length).toBe(1);
    expect(rows[0].body).toBe("Cliente VIP");
    expect(rows[0].authorName).toBe("Luis");
  });

  it("rechaza body vacío y respeta org al borrar", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await expect(
      addNote(db, "o1", {
        conversationId: "c1",
        authorUserId: "u1",
        authorName: "Luis",
        body: "  ",
      }),
    ).rejects.toThrow();
    const n = await addNote(db, "o1", {
      conversationId: "c1",
      authorUserId: "u1",
      authorName: "Luis",
      body: "x",
    });
    await deleteNote(db, "o2", n.id);
    expect((await listNotes(db, "o1", "c1")).length).toBe(1);
  });
});
