"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { createCampaign } from "@/lib/campaigns/create";
import { getWorker } from "@/lib/campaigns/worker";
import { campaignRecipients, campaigns } from "@/lib/db/schema";

export type RetryFailedResult =
  | { ok: true; campaignId: string; total: number }
  | { ok: false; error: string };

/** Crea una campaña nueva solo con los destinatarios fallidos de la original. */
export async function retryFailedAction(campaignId: string): Promise<RetryFailedResult> {
  const { orgId, session } = await requireOrg();
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!camp || camp.orgId !== orgId) return { ok: false, error: "Campaña no encontrada" };
  if (camp.status !== "done" && camp.status !== "failed") {
    return { ok: false, error: "Espera a que la campaña termine para reintentar" };
  }

  const failed = await db
    .select()
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "failed")));
  if (failed.length === 0) return { ok: false, error: "No hay destinatarios fallidos" };

  const { campaignId: newId, total } = await createCampaign(db, {
    orgId,
    createdBy: session.user.id,
    name: `${camp.name} (reintento)`,
    templateName: camp.templateName,
    templateLanguage: camp.templateLanguage,
    headerType: camp.headerType as "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT",
    headerHandle: camp.headerHandle,
    templateType: (camp.templateType as "standard" | "carousel") ?? "standard",
    componentPlanJson: camp.componentPlanJson,
    source: "adhoc",
    recipients: failed.map((r) => ({
      contactId: r.contactId ?? undefined,
      phone: r.phone,
      name: r.name,
      params: JSON.parse(r.params) as Record<string, string>,
    })),
  });

  void getWorker(db)
    .runCampaign(newId)
    .catch((e) => console.error("retry sender error", e));

  return { ok: true, campaignId: newId, total };
}
