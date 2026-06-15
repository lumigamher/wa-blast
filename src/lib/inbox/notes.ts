import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { conversationNotes } from "@/lib/db/schema";

export async function listNotes(db: DB, orgId: string, conversationId: string) {
  return db
    .select()
    .from(conversationNotes)
    .where(
      and(
        eq(conversationNotes.orgId, orgId),
        eq(conversationNotes.conversationId, conversationId),
      ),
    )
    .orderBy(asc(conversationNotes.createdAt));
}

export async function addNote(
  db: DB,
  orgId: string,
  input: {
    conversationId: string;
    authorUserId: string;
    authorName: string;
    body: string;
  },
) {
  if (!input.body.trim()) throw new Error("La nota no puede estar vacía");
  const row = {
    id: randomUUID(),
    orgId,
    conversationId: input.conversationId,
    authorUserId: input.authorUserId,
    authorName: input.authorName,
    body: input.body.trim(),
    createdAt: new Date(),
  };
  await db.insert(conversationNotes).values(row);
  return row;
}

export async function deleteNote(db: DB, orgId: string, id: string) {
  await db
    .delete(conversationNotes)
    .where(and(eq(conversationNotes.id, id), eq(conversationNotes.orgId, orgId)));
}
