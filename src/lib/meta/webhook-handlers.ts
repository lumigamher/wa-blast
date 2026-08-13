import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getOrCreateConversationByIdentity, type Identity } from "@/lib/inbox/identity";
import type { DB } from "@/lib/db/client";
import { calls, campaignRecipients, campaigns, contacts, messageEvents } from "@/lib/db/schema";
import { matchOptOut } from "@/lib/optout/match";
import { parseInboundMessage } from "@/lib/inbox/parse-inbound";
import { recordInboundMessage, updateMessageStatusByWamid, getOrCreateConversation } from "@/lib/inbox/store";
import { upsertReaction } from "@/lib/inbox/reactions";
import { ensureInboundMedia } from "@/lib/media/inbound";
import { getOrgSettings } from "@/lib/org/settings";
import { markCallPermission, recordCallEvent, setCallAnswer } from "@/lib/calls/store";
import { maybeDispatchAgentTurn } from "@/lib/agent/dispatch";

export async function handleStatusEvent(
  db: DB,
  orgId: string,
  status: { id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp: string; recipient_id?: string; recipient_user_id?: string; errors?: Array<{ message?: string; title?: string }> },
) {
  const ts = new Date(Number(status.timestamp) * 1000);
  const inserted = await db
    .insert(messageEvents)
    .values({
      wamid: status.id,
      event: status.status,
      timestamp: ts,
      payload: JSON.stringify(status),
    })
    .onConflictDoNothing({ target: [messageEvents.wamid, messageEvents.event] })
    .returning({ id: messageEvents.id });
  if (inserted.length === 0) return; // webhook retransmitido: ya procesado

  // Update inbox message status
  await updateMessageStatusByWamid(db, status.id, status.status, status.errors?.[0]?.message);

  const [rec] = await db.select().from(campaignRecipients).where(eq(campaignRecipients.wamid, status.id));
  if (!rec) return;

  // Verify the campaign belongs to this org
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, rec.campaignId));
  if (!camp || camp.orgId !== orgId) return;

  if (status.status === "delivered") {
    await db
      .update(campaigns)
      .set({ delivered: sql`${campaigns.delivered} + 1` })
      .where(eq(campaigns.id, rec.campaignId));
    await db.update(campaignRecipients).set({ status: "delivered" }).where(eq(campaignRecipients.id, rec.id));
  } else if (status.status === "read") {
    await db
      .update(campaigns)
      .set({ read: sql`${campaigns.read} + 1` })
      .where(eq(campaigns.id, rec.campaignId));
    await db.update(campaignRecipients).set({ status: "read" }).where(eq(campaignRecipients.id, rec.id));
  } else if (status.status === "failed") {
    await db
      .update(campaigns)
      .set({ failed: sql`${campaigns.failed} + 1` })
      .where(eq(campaigns.id, rec.campaignId));
    await db.update(campaignRecipients).set({ status: "failed" }).where(eq(campaignRecipients.id, rec.id));
  }
}

export async function handleInboundMessage(
  db: DB,
  orgId: string,
  msg: { from?: string; id: string; timestamp: string; type: string; text?: { body: string }; reaction?: { message_id: string; emoji: string } } & Record<string, unknown>,
  optoutKeywords: string[],
  profileName: string | null | undefined,
  identity: Identity,
) {
  const ts = new Date(Number(msg.timestamp) * 1000);

  // Handle reactions early and return
  if (msg.type === "reaction" && msg.reaction) {
    const conv = await getOrCreateConversationByIdentity(db, orgId, identity, ts, profileName);
    await upsertReaction(db, {
      orgId, conversationId: conv.id, targetWamid: msg.reaction.message_id,
      direction: "in", emoji: msg.reaction.emoji ?? "",
    });
    return;
  }

  const body = msg.text?.body ?? "";

  // Gate: insert replied event only if this is the first transmission
  const inserted = await db
    .insert(messageEvents)
    .values({
      wamid: msg.id,
      event: "replied",
      timestamp: ts,
      payload: JSON.stringify({ from: msg.from ?? identity.bsuid, preview: body.slice(0, 40) }),
    })
    .onConflictDoNothing({ target: [messageEvents.wamid, messageEvents.event] })
    .returning({ id: messageEvents.id });
  if (inserted.length === 0) return; // webhook retransmitido: ya procesado

  if (body && matchOptOut(body, optoutKeywords)) {
    const col = identity.bsuid ? contacts.bsuid : contacts.phone;
    const val = (identity.bsuid ?? identity.phone) as string;
    await db.update(contacts).set({ optOutAt: ts }).where(and(eq(contacts.orgId, orgId), eq(col, val)));
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [recent] = await db
    .select()
    .from(campaignRecipients)
    .where(
      and(
        identity.bsuid && !identity.phone
          ? eq(campaignRecipients.bsuid, identity.bsuid)
          : eq(campaignRecipients.phone, identity.phone as string),
        gte(campaignRecipients.sentAt, cutoff),
      ),
    )
    .orderBy(desc(campaignRecipients.sentAt))
    .limit(1);

  if (recent) {
    await db
      .update(campaigns)
      .set({ replied: sql`${campaigns.replied} + 1` })
      .where(eq(campaigns.id, recent.campaignId));
  }

  // Parse message once and reuse
  const parsed = parseInboundMessage(msg);

  // Persist inbound message to inbox
  const conversationId = await recordInboundMessage(db, {
    orgId,
    identity,
    wamid: msg.id,
    parsed,
    ts,
    profileName,
  });

  // Dispara el agente IA (si la org lo tiene activo y la conversación no está pausada).
  try {
    await maybeDispatchAgentTurn(db, orgId, conversationId, identity);
  } catch (e) {
    console.error("[agent] dispatch fallo", e);
  }

  // Proactively cache inbound media (best-effort, doesn't break webhook if it fails)
  if (parsed.mediaId) {
    try {
      const settings = await getOrgSettings(db, orgId);
      if (settings.metaAccessToken) {
        await ensureInboundMedia(db, {
          orgId,
          metaMediaId: parsed.mediaId,
          accessToken: settings.metaAccessToken,
          directUrl: parsed.mediaUrl,
          mime: parsed.mediaMime,
        });
      }
    } catch {
      // Best-effort: log silently and continue
    }
  }
}

export async function handleCallEvent(
  db: DB,
  orgId: string,
  call: { id: string; from?: string; to?: string; event: string; timestamp?: string; direction?: string; status?: string; duration?: number; session?: { sdp?: string; sdp_type?: string } },
) {
  const phoneRaw = call.direction === "BUSINESS_INITIATED" ? call.to : call.from;
  if (!phoneRaw) return;
  const phone = "+" + phoneRaw.replace(/^\+/, "");
  const ts = call.timestamp ? new Date(Number(call.timestamp) * 1000) : new Date();
  const direction: "in" | "out" = call.direction === "BUSINESS_INITIATED" ? "out" : "in";
  const conv = await getOrCreateConversation(db, orgId, phone, ts);
  // Saliente: el SDP answer del usuario llega aquí → persistirlo en la fila existente.
  if (direction === "out" && call.session?.sdp && call.session?.sdp_type === "answer") {
    const [existing] = await db.select().from(calls).where(and(eq(calls.orgId, orgId), eq(calls.wacid, call.id)));
    if (existing) await setCallAnswer(db, orgId, existing.id, call.session.sdp);
  }
  const event: "connect" | "terminate" = call.event === "terminate" ? "terminate" : "connect";
  await recordCallEvent(db, {
    orgId,
    conversationId: conv.id,
    phone,
    wacid: call.id,
    direction,
    event,
    status: call.status,
    durationSec: call.duration,
    sdp: call.session?.sdp,
    sdpType: call.session?.sdp_type,
    ts,
  });
}

export async function handleCallPermissionReply(
  db: DB,
  orgId: string,
  reply: { fromPhone: string; response: string; expirationTs?: number },
) {
  const phone = "+" + reply.fromPhone.replace(/^\+/, "");
  const conv = await getOrCreateConversation(db, orgId, phone, new Date());
  if (!conv.contactId) return;
  const accepted = reply.response.toLowerCase().includes("accept");
  if (!accepted) {
    // rechazo: dejar permiso temporal ya expirado (no vigente)
    await markCallPermission(db, orgId, conv.contactId, "temporary", new Date(0));
    return;
  }
  if (reply.expirationTs) {
    await markCallPermission(db, orgId, conv.contactId, "temporary", new Date(reply.expirationTs * 1000));
  } else {
    await markCallPermission(db, orgId, conv.contactId, "permanent", null);
  }
}
