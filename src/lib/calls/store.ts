import { and, desc, eq, gte, like, or, sql, type SQL } from "drizzle-orm";
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
  sdp?: string;
  sdpType?: string;
  ts: Date;
};

function statusFor(e: CallEvent): "ringing" | "missed" | "completed" | "rejected" | "failed" {
  if (e.event === "connect") return "ringing";
  const s = (e.status ?? "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("no_answer") || s.includes("no-answer") || s.includes("miss") || s.includes("expire") || s.includes("timeout")) return "missed";
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
        status: e.event === "terminate" ? status : existing.status,
        durationSec: e.durationSec ?? existing.durationSec ?? null,
        endedAt: e.event === "terminate" ? e.ts : existing.endedAt,
        sdp: e.sdp ?? existing.sdp ?? null,
        sdpType: e.sdpType ?? existing.sdpType ?? null,
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
    sdp: e.sdp ?? null,
    sdpType: e.sdpType ?? null,
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
  recordingMediaId: string | null;
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
      recordingMediaId: calls.recordingMediaId,
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

export type RingingCall = {
  id: string;
  phone: string;
  contactName: string | null;
  conversationId: string;
  createdAt: Date;
};

export async function getRingingCalls(db: DB, orgId: string, windowSec = 90): Promise<RingingCall[]> {
  const since = new Date(Date.now() - windowSec * 1000);
  return db
    .select({
      id: calls.id,
      phone: calls.phone,
      contactName: contacts.name,
      conversationId: calls.conversationId,
      createdAt: calls.createdAt,
    })
    .from(calls)
    .leftJoin(conversations, eq(calls.conversationId, conversations.id))
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(
      and(
        eq(calls.orgId, orgId),
        eq(calls.direction, "in"),
        eq(calls.status, "ringing"),
        gte(calls.createdAt, since),
      ),
    )
    .orderBy(desc(calls.createdAt));
}

export async function getCallById(db: DB, orgId: string, id: string) {
  const [row] = await db.select().from(calls).where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
  return row ?? null;
}

export async function markCallConnected(db: DB, orgId: string, id: string, at: Date): Promise<void> {
  await db
    .update(calls)
    .set({ status: "connected", answeredAt: at, startedAt: at })
    .where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}

export async function markCallRejected(db: DB, orgId: string, id: string): Promise<void> {
  await db
    .update(calls)
    .set({ status: "rejected", endedAt: new Date() })
    .where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}

export async function setRecordingMediaId(db: DB, orgId: string, id: string, mediaId: string): Promise<void> {
  await db
    .update(calls)
    .set({ recordingMediaId: mediaId })
    .where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}

export async function markCallPermission(
  db: DB,
  orgId: string,
  contactId: string,
  status: "temporary" | "permanent",
  expiresAt: Date | null,
): Promise<void> {
  await db
    .update(contacts)
    .set({ callPermissionStatus: status, callPermissionExpiresAt: expiresAt, updatedAt: new Date() })
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
}

export async function getContactCallPermission(
  db: DB,
  orgId: string,
  contactId: string,
): Promise<{ status: "temporary" | "permanent" | null; expiresAt: Date | null; valid: boolean }> {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  const status = c?.callPermissionStatus ?? null;
  const expiresAt = c?.callPermissionExpiresAt ?? null;
  const valid = status === "permanent" || (status === "temporary" && !!expiresAt && expiresAt.getTime() > Date.now());
  return { status, expiresAt, valid };
}

export async function createOutboundCall(
  db: DB,
  e: { orgId: string; conversationId: string; phone: string; wacid: string },
): Promise<string> {
  const id = randomUUID();
  await db.insert(calls).values({
    id,
    orgId: e.orgId,
    conversationId: e.conversationId,
    phone: e.phone,
    direction: "out",
    status: "ringing",
    wacid: e.wacid,
    startedAt: new Date(),
    createdAt: new Date(),
  });
  return id;
}

export async function setCallAnswer(db: DB, orgId: string, id: string, sdp: string): Promise<void> {
  await db.update(calls).set({ answerSdp: sdp }).where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}

export async function getCallAnswer(db: DB, orgId: string, id: string): Promise<string | null> {
  const [row] = await db.select().from(calls).where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
  return row?.answerSdp ?? null;
}
