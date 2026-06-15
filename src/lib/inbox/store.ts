import { and, desc, eq, gt, like, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { contacts, conversations, messages } from "@/lib/db/schema";
import type { ParsedInbound } from "@/lib/inbox/parse-inbound";
import { getReactionsForMessages } from "@/lib/inbox/reactions";

export async function getOrCreateConversation(db: DB, orgId: string, phone: string, ts: Date, profileName?: string | null) {
  let contact = (await db.select().from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone))))[0];

  if (!contact) {
    const newContact = {
      id: randomUUID(), orgId, phone, name: profileName?.trim() || null, email: null,
      customFields: "{}", optOutAt: null, createdAt: ts, updatedAt: ts,
    };
    await db.insert(contacts).values(newContact).onConflictDoNothing();
    contact = (await db.select().from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone))))[0];
  } else if (!contact.name && profileName?.trim()) {
    await db.update(contacts).set({ name: profileName.trim(), updatedAt: ts }).where(eq(contacts.id, contact.id));
    contact = { ...contact, name: profileName.trim() };
  }

  const existing = (await db.select().from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.phone, phone))))[0];
  if (existing) {
    if (!existing.contactId && contact) {
      await db.update(conversations).set({ contactId: contact.id }).where(eq(conversations.id, existing.id));
      return { ...existing, contactId: contact.id };
    }
    return existing;
  }

  const row = {
    id: randomUUID(), orgId, phone, contactId: contact?.id ?? null,
    lastMessageAt: ts, lastIncomingAt: null as Date | null, unreadCount: 0, createdAt: ts,
  };
  await db.insert(conversations).values(row).onConflictDoNothing();
  return (await db.select().from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.phone, phone))))[0];
}

export async function recordInboundMessage(db: DB, input: {
  orgId: string; phone: string; wamid: string; parsed: ParsedInbound; ts: Date; profileName?: string | null;
}): Promise<void> {
  const conv = await getOrCreateConversation(db, input.orgId, input.phone, input.ts, input.profileName);

  // dedupe por wamid: verificar manualmente si ya existe
  if (input.wamid) {
    const dup = (await db.select().from(messages)
      .where(and(eq(messages.orgId, input.orgId), eq(messages.wamid, input.wamid))))[0];
    if (dup) return;
  }

  await db.insert(messages).values({
    id: randomUUID(), conversationId: conv.id, orgId: input.orgId, direction: "in",
    wamid: input.wamid, type: input.parsed.type, body: input.parsed.body,
    mediaId: input.parsed.mediaId, status: null, errorMessage: null,
    payloadJson: input.parsed.payloadJson, createdAt: input.ts,
  });

  await db.update(conversations).set({
    lastMessageAt: input.ts, lastIncomingAt: input.ts,
    unreadCount: sql`${conversations.unreadCount} + 1`,
  }).where(eq(conversations.id, conv.id));
}

export async function recordOutboundMessage(db: DB, input: {
  orgId: string; conversationId: string; wamid: string | null; type: string;
  body: string | null; status?: "pending" | "sent" | "failed"; errorMessage?: string | null; mediaId?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(messages).values({
    id, conversationId: input.conversationId, orgId: input.orgId, direction: "out",
    wamid: input.wamid, type: input.type, body: input.body, mediaId: input.mediaId ?? null,
    status: input.status ?? (input.wamid ? "sent" : "failed"),
    errorMessage: input.errorMessage ?? null, payloadJson: null, createdAt: now,
  });
  await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, input.conversationId));
  return id;
}

export async function updateMessageStatusByWamid(db: DB, wamid: string, status: "sent" | "delivered" | "read" | "failed", errorMessage?: string): Promise<void> {
  await db.update(messages).set({
    status: status,
    errorMessage: errorMessage ?? null,
  }).where(eq(messages.wamid, wamid));
}

export async function markConversationRead(db: DB, orgId: string, conversationId: string): Promise<void> {
  await db.update(conversations).set({
    unreadCount: 0,
  }).where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
}

export type ConversationListItem = {
  id: string; phone: string; contactName: string | null; preview: string | null;
  lastMessageAt: Date; lastIncomingAt: Date | null; unreadCount: number;
};

export async function listConversations(db: DB, orgId: string, opts: { q?: string; unreadOnly?: boolean }): Promise<ConversationListItem[]> {
  const conditions: SQL<unknown>[] = [eq(conversations.orgId, orgId)];

  if (opts.unreadOnly) {
    conditions.push(gt(conversations.unreadCount, 0));
  }

  if (opts.q) {
    const qLower = `%${(opts.q ?? "").toLowerCase()}%`;
    const orCondition = or(
      like(sql`lower(${contacts.name})`, qLower),
      like(sql`lower(${conversations.phone})`, qLower),
    );
    if (orCondition) {
      conditions.push(orCondition);
    }
  }

  return db.select({
    id: conversations.id,
    phone: conversations.phone,
    contactName: contacts.name,
    lastMessageAt: conversations.lastMessageAt,
    lastIncomingAt: conversations.lastIncomingAt,
    unreadCount: conversations.unreadCount,
    preview: sql<string | null>`(SELECT ${messages.body} FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id} ORDER BY ${messages.createdAt} DESC LIMIT 1)`,
  })
  .from(conversations)
  .leftJoin(contacts, eq(conversations.contactId, contacts.id))
  .where(and(...conditions))
  .orderBy(desc(conversations.lastMessageAt));
}

export async function getThread(db: DB, orgId: string, conversationId: string) {
  const conv = (await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId))))[0];
  if (!conv) return null;
  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  const contact = conv.contactId ? (await db.select().from(contacts).where(eq(contacts.id, conv.contactId)))[0] : null;
  const wamids = msgs.map((m) => m.wamid).filter((w): w is string => !!w);
  const reactions = await getReactionsForMessages(db, orgId, wamids);
  const reactionsByWamid: Record<string, { direction: "in" | "out"; emoji: string }[]> = {};
  for (const [k, v] of reactions) reactionsByWamid[k] = v;
  return { conversation: conv, messages: msgs, contact: contact ?? null, reactions: reactionsByWamid };
}

export async function getLastInboundWamid(db: DB, orgId: string, conversationId: string): Promise<string | null> {
  const row = (await db.select({ wamid: messages.wamid }).from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.orgId, orgId), eq(messages.direction, "in")))
    .orderBy(desc(messages.createdAt))
    .limit(1))[0];
  return row?.wamid ?? null;
}
