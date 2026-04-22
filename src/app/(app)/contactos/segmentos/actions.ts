"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { segments } from "@/lib/db/schema";
import { segmentRuleSchema } from "@/lib/segments/ast";
import { runSegment } from "@/lib/segments/query";

export async function createSegmentAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const name = String(formData.get("name") ?? "").trim();
  const ruleJson = String(formData.get("ruleJson") ?? "{}");
  const rule = segmentRuleSchema.parse(JSON.parse(ruleJson));
  const id = `seg_${crypto.randomUUID()}`;
  await db.insert(segments).values({ id, orgId, name, ruleJson: JSON.stringify(rule), createdAt: new Date() });
  revalidatePath("/contactos/segmentos");
  return id;
}

export async function previewSegmentAction(ruleJson: string) {
  const { orgId } = await requireOrg();
  const rule = segmentRuleSchema.parse(JSON.parse(ruleJson));
  const rows = await runSegment(db, orgId, rule);
  return { count: rows.length, first: rows.slice(0, 10) };
}

export async function listSegmentsAction() {
  const { orgId } = await requireOrg();
  return db.select().from(segments).where(eq(segments.orgId, orgId));
}
