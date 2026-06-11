"use server";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { checkSubscriptionGate } from "@/lib/billing/gate";
import { createCampaign } from "@/lib/campaigns/create";
import { getWorker } from "@/lib/campaigns/worker";
import { resolveVarMapping } from "@/lib/campaigns/build-carousel-plan";
import { campaignRecipients, campaigns, contactTags, contacts } from "@/lib/db/schema";

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
  templateType: z.enum(["standard", "carousel"]).optional(),
  componentPlanJson: z.string().optional().nullable(),
  varMapping: z
    .record(
      z.string(),
      z.object({ kind: z.enum(["field", "literal"]), value: z.string() }),
    )
    .optional(),
  scheduledAt: z.string().optional().nullable(),
  force: z.boolean().optional(),
});

export type CreateCampaignResult =
  | { ok: true; campaignId: string; scheduled: boolean }
  | { ok: false; error: string; duplicate?: boolean };

/**
 * Anti-footgun: si en los últimos 10 min ya salió una campaña con la misma plantilla
 * y ≥50% de los mismos números, casi seguro es un doble click / reenvío accidental.
 */
async function findRecentDuplicate(
  orgId: string,
  templateName: string,
  phones: string[],
): Promise<{ name: string; overlap: number } | null> {
  if (phones.length === 0) return null;
  const since = new Date(Date.now() - 10 * 60_000);
  const recent = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.templateName, templateName), gt(campaigns.createdAt, since)));
  if (recent.length === 0) return null;

  const newSet = new Set(phones);
  for (const camp of recent) {
    const rows = await db
      .select({ phone: campaignRecipients.phone })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, camp.id));
    const overlap = rows.filter((r) => newSet.has(r.phone)).length;
    if (overlap / newSet.size >= 0.5) return { name: camp.name, overlap };
  }
  return null;
}

export async function createCampaignAction(input: unknown): Promise<CreateCampaignResult> {
  const { orgId, session } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };

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

    recipients = rows.map((c) => {
      let params: Record<string, string>;

      if (data.templateType === "carousel" && data.varMapping) {
        // Server-side resolution for carousel
        const fields = {
          name: c.name ?? "",
          phone: c.phone,
          email: c.email ?? "",
        };
        params = resolveVarMapping(data.varMapping, fields);
      } else {
        // Standard flow
        params = data.paramsByContact?.[c.id] ?? {};
      }

      return {
        contactId: c.id,
        phone: c.phone,
        name: c.name,
        params,
      };
    });
  } else {
    const adhoc = data.adhocRows ?? [];
    if (adhoc.length === 0) return { ok: false, error: "No hay destinatarios" };

    recipients = adhoc.map((r) => {
      let params: Record<string, string>;

      if (data.templateType === "carousel" && data.varMapping) {
        // Server-side resolution for carousel
        const fields = {
          name: r.name ?? "",
          phone: r.phone,
          email: "",
        };
        params = resolveVarMapping(data.varMapping, fields);
      } else {
        // Standard flow
        params = r.params;
      }

      return {
        phone: r.phone,
        name: r.name ?? null,
        params,
      };
    });
  }

  if (recipients.length === 0) return { ok: false, error: "No hay destinatarios válidos" };

  if (!data.force) {
    const dup = await findRecentDuplicate(orgId, data.templateName, recipients.map((r) => r.phone));
    if (dup) {
      return {
        ok: false,
        duplicate: true,
        error: `Hace menos de 10 minutos enviaste "${dup.name}" con esta misma plantilla a ${dup.overlap} de estos números. ¿Enviar de todas formas?`,
      };
    }
  }

  const { campaignId } = await createCampaign(db, {
    orgId,
    createdBy: session.user.id,
    name: data.name,
    templateName: data.templateName,
    templateLanguage: data.templateLanguage,
    headerType: "NONE",
    templateType: data.templateType ?? "standard",
    componentPlanJson: data.componentPlanJson ?? null,
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
