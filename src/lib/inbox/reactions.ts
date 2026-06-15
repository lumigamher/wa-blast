import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { messageReactions } from "@/lib/db/schema";

export async function upsertReaction(
  db: DB,
  p: { orgId: string; conversationId: string; targetWamid: string; direction: "in" | "out"; emoji: string },
): Promise<void> {
  if (!p.emoji.trim()) {
    await db.delete(messageReactions).where(
      and(
        eq(messageReactions.orgId, p.orgId),
        eq(messageReactions.targetWamid, p.targetWamid),
        eq(messageReactions.direction, p.direction),
      ),
    );
    return;
  }
  await db
    .insert(messageReactions)
    .values({
      id: randomUUID(),
      orgId: p.orgId,
      conversationId: p.conversationId,
      targetWamid: p.targetWamid,
      direction: p.direction,
      emoji: p.emoji,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [messageReactions.orgId, messageReactions.targetWamid, messageReactions.direction],
      set: { emoji: p.emoji, updatedAt: new Date() },
    });
}

export type ReactionView = { direction: "in" | "out"; emoji: string };

export async function getReactionsForMessages(
  db: DB,
  orgId: string,
  wamids: string[],
): Promise<Map<string, ReactionView[]>> {
  const map = new Map<string, ReactionView[]>();
  const ids = wamids.filter(Boolean);
  if (!ids.length) return map;
  const rows = await db
    .select()
    .from(messageReactions)
    .where(and(eq(messageReactions.orgId, orgId), inArray(messageReactions.targetWamid, ids)));
  for (const r of rows) {
    const arr = map.get(r.targetWamid) ?? [];
    arr.push({ direction: r.direction, emoji: r.emoji });
    map.set(r.targetWamid, arr);
  }
  return map;
}
