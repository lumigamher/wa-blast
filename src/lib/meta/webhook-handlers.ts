import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaignRecipients, campaigns, contacts, messageEvents } from "@/lib/db/schema";
import { matchOptOut } from "@/lib/optout/match";

export async function handleStatusEvent(
  db: DB,
  orgId: string,
  status: { id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp: string; recipient_id: string },
) {
  const ts = new Date(Number(status.timestamp) * 1000);
  await db.insert(messageEvents).values({
    wamid: status.id,
    event: status.status,
    timestamp: ts,
    payload: JSON.stringify(status),
  });

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
  msg: { from: string; id: string; timestamp: string; type: string; text?: { body: string } },
  optoutKeywords: string[],
) {
  const phone = "+" + msg.from.replace(/^\+/, "");
  const body = msg.text?.body ?? "";
  const ts = new Date(Number(msg.timestamp) * 1000);

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
}
