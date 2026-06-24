import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";

export async function pauseAgent(db: DB, conversationId: string): Promise<void> {
  await db.update(conversations).set({ agentPaused: true }).where(eq(conversations.id, conversationId));
}

export async function resumeAgent(db: DB, conversationId: string): Promise<void> {
  await db.update(conversations).set({ agentPaused: false }).where(eq(conversations.id, conversationId));
}

export async function isPaused(db: DB, conversationId: string): Promise<boolean> {
  const row = (
    await db.select({ paused: conversations.agentPaused }).from(conversations).where(eq(conversations.id, conversationId))
  )[0];
  return row?.paused ?? false;
}

export async function setAgentPaused(
  db: DB,
  orgId: string,
  conversationId: string,
  paused: boolean,
): Promise<void> {
  await db
    .update(conversations)
    .set({ agentPaused: paused })
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
}

export async function setAgentTyping(db: DB, conversationId: string, until: Date | null): Promise<void> {
  await db.update(conversations).set({ agentTypingUntil: until }).where(eq(conversations.id, conversationId));
}
