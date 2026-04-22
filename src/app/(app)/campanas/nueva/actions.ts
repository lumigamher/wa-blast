"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { createCampaign } from "@/lib/campaigns/create";
import { getWorker } from "@/lib/campaigns/worker";
import { contactTags, contacts } from "@/lib/db/schema";

const inputSchema = z.object({
  name: z.string().min(1),
  templateName: z.string().min(1),
  templateLanguage: z.string().min(1),
  source: z.enum(["tags", "adhoc"]),
  tagIds: z.array(z.string()).optional(),
  adhocRows: z
    .array(
      z.object({
        phone: z.string(),
        name: z.string().optional().nullable(),
        params: z.record(z.string(), z.string()).default({}),
      }),
    )
    .optional(),
  paramsByContact: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  scheduledAt: z.string().optional().nullable(),
});

export type CreateCampaignResult =
  | { ok: true; campaignId: string; scheduled: boolean }
  | { ok: false; error: string };

export async function createCampaignAction(input: unknown): Promise<CreateCampaignResult> {
  const { orgId, session } = await requireOrg();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Input inválido" };
  const data = parsed.data;

  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "La fecha programada debe ser a futuro" };
  }

  let recipients: Parameters<typeof createCampaign>[1]["recipients"] = [];

  if (data.source === "tags") {
    const tagIds = data.tagIds ?? [];
    if (tagIds.length === 0) return { ok: false, error: "Selecciona al menos un tag" };

    const contactIds = await db
      .select({ id: contactTags.contactId })
      .from(contactTags)
      .where(inArray(contactTags.tagId, tagIds));

    const uniqueIds = [...new Set(contactIds.map((r) => r.id))];
    if (uniqueIds.length === 0) return { ok: false, error: "Los tags seleccionados no tienen contactos" };

    const rows = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, uniqueIds), isNull(contacts.optOutAt)));

    recipients = rows.map((c) => ({
      contactId: c.id,
      phone: c.phone,
      name: c.name,
      params: data.paramsByContact?.[c.id] ?? {},
    }));
  } else {
    const adhoc = data.adhocRows ?? [];
    if (adhoc.length === 0) return { ok: false, error: "No hay destinatarios" };
    recipients = adhoc.map((r) => ({
      phone: r.phone,
      name: r.name ?? null,
      params: r.params,
    }));
  }

  if (recipients.length === 0) return { ok: false, error: "No hay destinatarios válidos" };

  const { campaignId } = await createCampaign(db, {
    orgId,
    createdBy: session.user.id,
    name: data.name,
    templateName: data.templateName,
    templateLanguage: data.templateLanguage,
    headerType: "NONE",
    source: data.source === "tags" ? "segment" : "adhoc",
    scheduledAt,
    recipients,
  });

  if (!scheduledAt) {
    void getWorker(db)
      .runCampaign(campaignId)
      .catch((e) => console.error("sender error", e));
  }

  return { ok: true, campaignId, scheduled: Boolean(scheduledAt) };
}
