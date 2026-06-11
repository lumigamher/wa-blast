import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { quickReplies } from "@/lib/db/schema";

export async function listQuickReplies(db: DB, orgId: string) {
  return db
    .select()
    .from(quickReplies)
    .where(eq(quickReplies.orgId, orgId))
    .orderBy(quickReplies.shortcut);
}

export async function createQuickReply(db: DB, orgId: string, input: { shortcut: string; body: string }) {
  if (!input.shortcut.trim() || !input.body.trim()) throw new Error("Shortcut y mensaje son obligatorios");
  const row = {
    id: randomUUID(),
    orgId,
    shortcut: input.shortcut.trim(),
    body: input.body.trim(),
    createdAt: new Date(),
  };
  await db.insert(quickReplies).values(row);
  return row;
}

export async function deleteQuickReply(db: DB, orgId: string, id: string) {
  await db.delete(quickReplies).where(and(eq(quickReplies.id, id), eq(quickReplies.orgId, orgId)));
}
