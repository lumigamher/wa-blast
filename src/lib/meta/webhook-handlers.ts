import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaignRecipients, campaigns, contacts, messageEvents } from "@/lib/db/schema";
import { matchOptOut } from "@/lib/optout/match";
import { parseInboundMessage } from "@/lib/inbox/parse-inbound";
import { recordInboundMessage, updateMessageStatusByWamid, getOrCreateConversation } from "@/lib/inbox/store";
import { upsertReaction } from "@/lib/inbox/reactions";
import { ensureInboundMedia } from "@/lib/media/inbound";
import { getOrgSettings } from "@/lib/org/settings";
import { recordCallEvent } from "@/lib/calls/store";

export async function handleStatusEvent(
  db: DB,
  orgId: string,
  status: { id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp: string; recipient_id: string; errors?: Array<{ message?: string }> },
) {
  const ts = new Date(Number(status.timestamp) * 1000);
  await db.insert(messageEvents).values({
    wamid: status.id,
    event: status.status,
    timestamp: ts,
    payload: JSON.stringify(status),
  });

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
  msg: { from: string; id: string; timestamp: string; type: string; text?: { body: string }; reaction?: { message_id: string; emoji: string } } & Record<string, unknown>,
  optoutKeywords: string[],
  profileName?: string | null,
) {
  const phone = "+" + msg.from.replace(/^\+/, "");
  const ts = new Date(Number(msg.timestamp) * 1000);

  // Handle reactions early and return
  if (msg.type === "reaction" && msg.reaction) {
    const conv = await getOrCreateConversation(db, orgId, phone, ts, profileName);
    await upsertReaction(db, {
      orgId, conversationId: conv.id, targetWamid: msg.reaction.message_id,
      direction: "in", emoji: msg.reaction.emoji ?? "",
    });
    return;
  }

  const body = msg.text?.body ?? "";

  if (body && matchOptOut(body, optoutKeywords)) {
    await db
      .update(contacts)
      .set({ optOutAt: ts })
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone)));
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [recent] = await db
    .select()
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.phone, phone), gte(campaignRecipients.sentAt, cutoff)))
    .orderBy(desc(campaignRecipients.sentAt))
    .limit(1);

  if (recent) {
    await db
      .update(campaigns)
      .set({ replied: sql`${campaigns.replied} + 1` })
      .where(eq(campaigns.id, recent.campaignId));
  }

  await db.insert(messageEvents).values({
    wamid: msg.id,
    event: "replied",
    timestamp: ts,
    payload: JSON.stringify({ from: msg.from, preview: body.slice(0, 40) }),
  });

  // Parse message once and reuse
  const parsed = parseInboundMessage(msg);

  // Persist inbound message to inbox
  await recordInboundMessage(db, { orgId, phone, wamid: msg.id, parsed, ts, profileName });

  // Proactively cache inbound media (best-effort, doesn't break webhook if it fails)
  if (parsed.mediaId) {
    try {
      const settings = await getOrgSettings(db, orgId);
      if (settings.metaAccessToken) {
        await ensureInboundMedia(db, {
          orgId,
          metaMediaId: parsed.mediaId,
          accessToken: settings.metaAccessToken,
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
  call: { id: string; from?: string; to?: string; event: string; timestamp?: string; direction?: string; status?: string; duration?: number },
) {
  const phoneRaw = call.direction === "BUSINESS_INITIATED" ? call.to : call.from;
  if (!phoneRaw) return;
  const phone = "+" + phoneRaw.replace(/^\+/, "");
  const ts = call.timestamp ? new Date(Number(call.timestamp) * 1000) : new Date();
  const direction: "in" | "out" = call.direction === "BUSINESS_INITIATED" ? "out" : "in";
  const conv = await getOrCreateConversation(db, orgId, phone, ts);
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
    ts,
  });
}
