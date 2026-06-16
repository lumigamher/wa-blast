import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { calls, contacts, conversations } from "@/lib/db/schema";

type CallEvent = {
  orgId: string;
  conversationId: string;
  phone: string;
  wacid: string;
  direction: "in" | "out";
  event: "connect" | "terminate";
  status?: string;
  durationSec?: number;
  ts: Date;
};

function statusFor(e: CallEvent): "ringing" | "missed" | "completed" | "rejected" | "failed" {
  if (e.event === "connect") return "ringing";
  const s = (e.status ?? "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("fail")) return "failed";
  if ((e.durationSec ?? 0) > 0) return "completed";
  return "missed";
}

export async function recordCallEvent(db: DB, e: CallEvent): Promise<void> {
  const status = statusFor(e);
  const existing = (
    await db
      .select()
      .from(calls)
      .where(and(eq(calls.orgId, e.orgId), eq(calls.wacid, e.wacid)))
  )[0];
  if (existing) {
    await db
      .update(calls)
      .set({
        status,
        durationSec: e.durationSec ?? existing.durationSec ?? null,
        endedAt: e.event === "terminate" ? e.ts : existing.endedAt,
      })
      .where(eq(calls.id, existing.id));
    return;
  }
  await db.insert(calls).values({
    id: randomUUID(),
    orgId: e.orgId,
    conversationId: e.conversationId,
    phone: e.phone,
    direction: e.direction,
    status,
    wacid: e.wacid,
    durationSec: e.durationSec ?? null,
    startedAt: e.event === "connect" ? e.ts : null,
    endedAt: e.event === "terminate" ? e.ts : null,
    createdAt: e.ts,
  });
}

export type CallListItem = {
  id: string;
  phone: string;
  contactName: string | null;
  direction: "in" | "out";
  status: string;
  durationSec: number | null;
  createdAt: Date;
  conversationId: string;
};

export async function listCalls(
  db: DB,
  orgId: string,
  opts: { status?: string; direction?: string; q?: string } = {},
): Promise<CallListItem[]> {
  const conds: SQL<unknown>[] = [eq(calls.orgId, orgId)];
  if (opts.status) conds.push(eq(calls.status, opts.status as never));
  if (opts.direction) conds.push(eq(calls.direction, opts.direction as never));
  if (opts.q) {
    const qq = `%${opts.q.toLowerCase()}%`;
    const o = or(
      like(sql`lower(${contacts.name})`, qq),
      like(calls.phone, `%${opts.q}%`),
    );
    if (o) conds.push(o);
  }
  return db
    .select({
      id: calls.id,
      phone: calls.phone,
      contactName: contacts.name,
      direction: calls.direction,
      status: calls.status,
      durationSec: calls.durationSec,
      createdAt: calls.createdAt,
      conversationId: calls.conversationId,
    })
    .from(calls)
    .leftJoin(conversations, eq(calls.conversationId, conversations.id))
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(and(...conds))
    .orderBy(desc(calls.createdAt));
}

export async function getCallsForConversation(db: DB, orgId: string, conversationId: string) {
  return db
    .select()
    .from(calls)
    .where(and(eq(calls.orgId, orgId), eq(calls.conversationId, conversationId)))
    .orderBy(calls.createdAt);
}
