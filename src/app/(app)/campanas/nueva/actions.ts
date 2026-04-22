"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { createCampaign } from "@/lib/campaigns/create";
import { getWorker } from "@/lib/campaigns/worker";
import { runSegment } from "@/lib/segments/query";
import { segmentRuleSchema } from "@/lib/segments/ast";
import { segments } from "@/lib/db/schema";

export async function createFromSegmentAction(formData: FormData) {
  const { orgId, session } = await requireOrg();
  const segmentId = String(formData.get("segmentId") ?? "");
  const name = String(formData.get("name") ?? "");
  const templateName = String(formData.get("templateName") ?? "");
  const templateLanguage = String(formData.get("templateLanguage") ?? "es");
  const paramsCsv = String(formData.get("paramsCsv") ?? "");

  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId));
  if (!seg) throw new Error("segment not found");

  const rule = segmentRuleSchema.parse(JSON.parse(seg.ruleJson));
  const rows = await runSegment(db, orgId, rule);

  const paramValues = paramsCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const recipients = rows.map((c) => ({
    contactId: c.id,
    phone: c.phone,
    name: c.name,
    params: Object.fromEntries(paramValues.map((v, i) => [String(i + 1), resolveParam(v, c)])),
  }));

  const { campaignId } = await createCampaign(db, {
    orgId,
    createdBy: session.user.id,
    name,
    templateName,
    templateLanguage,
    headerType: "NONE",
    source: "segment",
    segmentId,
    recipients,
  });

  void getWorker(db)
    .runCampaign(campaignId)
    .catch((e) => console.error("sender error", e));

  redirect(`/campanas/${campaignId}`);
}

function resolveParam(spec: string, c: { name: string | null; customFields: string }): string {
  if (spec === "{{name}}") return c.name ?? "";
  if (spec.startsWith("{{custom.")) {
    const key = spec.slice("{{custom.".length, -2);
    try {
      const cf = JSON.parse(c.customFields) as Record<string, string>;
      return cf[key] ?? "";
    } catch {
      return "";
    }
  }
  return spec;
}
