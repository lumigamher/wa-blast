"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { saveForwardUrl, saveMetaCreds, saveOptoutKeywords } from "@/lib/org/settings";

const metaSchema = z.object({
  metaPhoneId: z.string().min(1),
  metaWabaId: z.string().min(1),
  metaAppId: z.string().min(1),
  metaAccessToken: z.string().min(10),
  metaAppSecret: z.string().min(10),
  metaVerifyToken: z.string().min(4),
});

export async function saveMetaCredsAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const input = metaSchema.parse(Object.fromEntries(formData));
  await saveMetaCreds(db, orgId, input);
  revalidatePath("/configuracion/meta");
}

export async function saveForwardUrlAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const url = String(formData.get("forwardUrl") ?? "").trim();
  await saveForwardUrl(db, orgId, url || null);
  revalidatePath("/configuracion/meta");
}

export async function saveOptoutKeywordsAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const raw = String(formData.get("keywords") ?? "");
  const kw = raw
    .split(/[\n,]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  await saveOptoutKeywords(db, orgId, kw);
  revalidatePath("/configuracion/meta");
}
