import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, like, or, type SQL, sql } from "drizzle-orm";
import { getCallsForConversation } from "@/lib/calls/store";
import type { DB } from "@/lib/db/client";
import {
  contacts,
  conversations,
  conversationLabelLinks,
  messages,
} from "@/lib/db/schema";
import { recordFlowResponse } from "@/lib/flows/responses";
import { getOrCreateConversationByIdentity, type Identity } from "@/lib/inbox/identity";
import { listNotes } from "@/lib/inbox/notes";
import type { ParsedInbound } from "@/lib/inbox/parse-inbound";
import { getReactionsForMessages } from "@/lib/inbox/reactions";

/**
 * Atajo para los llamadores que sí tienen teléfono (llamadas, worker de
 * campañas). Delega en la resolución por identidad para no duplicar las reglas.
 */
export async function getOrCreateConversation(
  db: DB,
  orgId: string,
  phone: string,
  ts: Date,
  profileName?: string | null,
) {
  return getOrCreateConversationByIdentity(db, orgId, { phone }, ts, profileName);
}

export async function recordInboundMessage(
  db: DB,
  input: {
    orgId: string;
    identity: Identity;
    wamid: string;
    parsed: ParsedInbound;
    ts: Date;
    profileName?: string | null;
  },
): Promise<string> {
  const conv = await getOrCreateConversationByIdentity(
    db,
    input.orgId,
    input.identity,
    input.ts,
    input.profileName,
  );

  // dedupe por wamid: verificar manualmente si ya existe
  if (input.wamid) {
    const dup = (
      await db
        .select()
        .from(messages)
        .where(
          and(eq(messages.orgId, input.orgId), eq(messages.wamid, input.wamid)),
        )
    )[0];
    if (dup) return conv.id;
  }

  await db.insert(messages).values({
    id: randomUUID(),
    conversationId: conv.id,
    orgId: input.orgId,
    direction: "in",
    wamid: input.wamid,
    type: input.parsed.type,
    body: input.parsed.body,
    mediaId: input.parsed.mediaId,
    status: null,
    errorMessage: null,
    payloadJson: input.parsed.payloadJson,
    replyToWamid: input.parsed.replyToWamid,
    createdAt: input.ts,
  });

  await db
    .update(conversations)
    .set({
      lastMessageAt: input.ts,
      lastIncomingAt: input.ts,
      unreadCount: sql`${conversations.unreadCount} + 1`,
    })
    .where(eq(conversations.id, conv.id));

  // Respuesta de formulario (WhatsApp Flow): además del mensaje, persiste una
  // fila estructurada para gestión/exportación.
  if (input.parsed.type === "flow") {
    await recordFlowResponse(db, {
      orgId: input.orgId,
      conversationId: conv.id,
      contactId: conv.contactId ?? null,
      phone: input.identity.phone ?? null,
      contactName: input.profileName ?? null,
      wamid: input.wamid ?? null,
      payloadJson: input.parsed.payloadJson,
      ts: input.ts,
    });
  }

  return conv.id;
}

export async function recordOutboundMessage(
  db: DB,
  input: {
    orgId: string;
    conversationId: string;
    wamid: string | null;
    type: string;
    body: string | null;
    status?: "pending" | "sent" | "failed";
    errorMessage?: string | null;
    mediaId?: string | null;
    replyToWamid?: string | null;
    payloadJson?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(messages).values({
    id,
    conversationId: input.conversationId,
    orgId: input.orgId,
    direction: "out",
    wamid: input.wamid,
    type: input.type,
    body: input.body,
    mediaId: input.mediaId ?? null,
    status: input.status ?? (input.wamid ? "sent" : "failed"),
    errorMessage: input.errorMessage ?? null,
    payloadJson: input.payloadJson ?? null,
    replyToWamid: input.replyToWamid ?? null,
    createdAt: now,
  });
  await db
    .update(conversations)
    .set({ lastMessageAt: now })
    .where(eq(conversations.id, input.conversationId));
  return id;
}

export async function updateMessageStatusByWamid(
  db: DB,
  wamid: string,
  status: "sent" | "delivered" | "read" | "failed",
  errorMessage?: string,
): Promise<void> {
  await db
    .update(messages)
    .set({
      status: status,
      errorMessage: errorMessage ?? null,
    })
    .where(eq(messages.wamid, wamid));
}

export async function setConversationStatus(
  db: DB,
  orgId: string,
  conversationId: string,
  status: "open" | "resolved",
): Promise<void> {
  await db
    .update(conversations)
    .set({
      status,
    })
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)),
    );
}

export async function markConversationRead(
  db: DB,
  orgId: string,
  conversationId: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({
      unreadCount: 0,
    })
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)),
    );
}

export type ConversationListItem = {
  id: string;
  phone: string | null;
  contactName: string | null;
  preview: string | null;
  previewDirection: "in" | "out" | null;
  lastMessageAt: Date;
  lastIncomingAt: Date | null;
  unreadCount: number;
  status: "open" | "resolved";
  agentPaused: boolean;
  agentTypingUntil: Date | null;
};

export async function listConversations(
  db: DB,
  orgId: string,
  opts: {
    q?: string;
    unreadOnly?: boolean;
    status?: "open" | "resolved" | "all";
    agent?: "ia" | "humano" | "all";
    labelId?: string;
  } = {},
): Promise<ConversationListItem[]> {
  const conditions: SQL<unknown>[] = [eq(conversations.orgId, orgId)];

  const statusFilter = opts.status ?? "open";
  if (statusFilter === "open" || statusFilter === "resolved") {
    conditions.push(eq(conversations.status, statusFilter));
  }

  if (opts.unreadOnly) {
    conditions.push(gt(conversations.unreadCount, 0));
  }

  if (opts.q) {
    const qLower = `%${(opts.q ?? "").toLowerCase()}%`;
    // Incluye username: quien adoptó un username no tiene teléfono que buscar,
    // así que sin esto su conversación sería inencontrable desde el buscador.
    const orCondition = or(
      like(sql`lower(${contacts.name})`, qLower),
      like(sql`lower(${conversations.phone})`, qLower),
      like(sql`lower(${conversations.username})`, qLower),
    );
    if (orCondition) {
      conditions.push(orCondition);
    }
  }

  if (opts.agent === "ia") conditions.push(eq(conversations.agentPaused, false));
  if (opts.agent === "humano")
    conditions.push(eq(conversations.agentPaused, true));

  if (opts.labelId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${conversationLabelLinks} WHERE ${conversationLabelLinks.conversationId} = ${conversations.id} AND ${conversationLabelLinks.labelId} = ${opts.labelId})`,
    );
  }

  return db
    .select({
      id: conversations.id,
      phone: conversations.phone,
      contactName: contacts.name,
      lastMessageAt: conversations.lastMessageAt,
      lastIncomingAt: conversations.lastIncomingAt,
      unreadCount: conversations.unreadCount,
      status: conversations.status,
      agentPaused: conversations.agentPaused,
      agentTypingUntil: conversations.agentTypingUntil,
      preview: sql<
        string | null
      >`(SELECT ${messages.body} FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id} ORDER BY ${messages.createdAt} DESC LIMIT 1)`,
      previewDirection: sql<
        "in" | "out" | null
      >`(SELECT ${messages.direction} FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id} ORDER BY ${messages.createdAt} DESC LIMIT 1)`,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function getThread(db: DB, orgId: string, conversationId: string) {
  const conv = (
    await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.orgId, orgId),
        ),
      )
  )[0];
  if (!conv) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
  const contact = conv.contactId
    ? (
        await db.select().from(contacts).where(eq(contacts.id, conv.contactId))
      )[0]
    : null;
  const wamids = msgs.map((m) => m.wamid).filter((w): w is string => !!w);
  const reactions = await getReactionsForMessages(db, orgId, wamids);
  const reactionsByWamid: Record<
    string,
    { direction: "in" | "out"; emoji: string }[]
  > = {};
  for (const [k, v] of reactions) reactionsByWamid[k] = v;
  const notes = await listNotes(db, orgId, conversationId);

  // Resolve quotes: build wamid -> message map and resolve each quote
  const msgsByWamid = new Map<string | null, (typeof msgs)[0]>();
  for (const m of msgs) {
    if (m.wamid) {
      msgsByWamid.set(m.wamid, m);
    }
  }
  const quotes: Record<string, { label: string; direction: "in" | "out" }> = {};
  for (const msg of msgs) {
    if (msg.replyToWamid) {
      const quoted = msgsByWamid.get(msg.replyToWamid);
      if (quoted) {
        quotes[msg.id] = {
          label: replyLabelForQuote(quoted),
          direction: quoted.direction,
        };
      } else {
        quotes[msg.id] = { label: "Mensaje", direction: "in" };
      }
    }
  }

  const callRows = await getCallsForConversation(db, orgId, conversationId);

  return {
    conversation: conv,
    messages: msgs,
    contact: contact ?? null,
    reactions: reactionsByWamid,
    notes,
    quotes,
    calls: callRows,
  };
}

function replyLabelForQuote(message: typeof messages.$inferSelect): string {
  switch (message.type) {
    case "text":
      return (message.body || "").slice(0, 60);
    case "image":
      return "Imagen";
    case "video":
      return "Video";
    case "audio":
      return "Nota de voz";
    case "sticker":
      return "Sticker";
    case "document":
      return message.body || "Documento";
    case "template":
      return "Plantilla";
    case "interactive":
    case "button":
    case "flow":
      return (message.body || "").slice(0, 60);
    default:
      return (message.body || "").slice(0, 60) || `[${message.type}]`;
  }
}

export async function getLastInboundWamid(
  db: DB,
  orgId: string,
  conversationId: string,
): Promise<string | null> {
  const row = (
    await db
      .select({ wamid: messages.wamid })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.orgId, orgId),
          eq(messages.direction, "in"),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1)
  )[0];
  return row?.wamid ?? null;
}
