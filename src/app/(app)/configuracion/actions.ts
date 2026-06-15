"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings, saveForwardUrl, saveMetaCreds, saveOptoutKeywords } from "@/lib/org/settings";
import { credsFromSettings, getPhoneHealth } from "@/lib/meta/graph";

const metaSchema = z.object({
  metaPhoneId: z.string().min(1),
  metaWabaId: z.string().min(1),
  metaAppId: z.string().min(1),
  metaAccessToken: z.string().min(10),
  metaAppSecret: z.string().min(10),
});

export async function saveMetaCredsAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const { orgId } = await requireOrg();
    const result = metaSchema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return { ok: false, message: "Revisa los campos: todos son obligatorios y el token/secret deben ser válidos." };
    }
    await saveMetaCreds(db, orgId, result.data);
    revalidatePath("/configuracion/meta");
    return { ok: true, message: "Credenciales de Meta guardadas." };
  } catch (e) {
    return {
      ok: false,
      message: `No se pudo guardar: ${e instanceof Error ? e.message : "error"}`,
    };
  }
}

export async function saveForwardUrlAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const { orgId } = await requireOrg();
    const url = String(formData.get("forwardUrl") ?? "").trim();
    await saveForwardUrl(db, orgId, url || null);
    revalidatePath("/configuracion/meta");
    return { ok: true, message: "URL de reenvío guardada." };
  } catch (e) {
    return {
      ok: false,
      message: `No se pudo guardar: ${e instanceof Error ? e.message : "error"}`,
    };
  }
}

export async function saveOptoutKeywordsAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const { orgId } = await requireOrg();
    const raw = String(formData.get("keywords") ?? "");
    const kw = raw
      .split(/[\n,]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    await saveOptoutKeywords(db, orgId, kw);
    revalidatePath("/configuracion/meta");
    return { ok: true, message: "Palabras de baja guardadas." };
  } catch (e) {
    return {
      ok: false,
      message: `No se pudo guardar: ${e instanceof Error ? e.message : "error"}`,
    };
  }
}

export async function testConnectionAction(): Promise<
  { ok: true; phone: string; name: string; quality?: string; tier?: string } | { ok: false; error: string }
> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);

  if (!creds) {
    return { ok: false, error: "Faltan credenciales" };
  }

  try {
    const health = await getPhoneHealth(creds);
    return {
      ok: true,
      phone: health.display_phone_number,
      name: health.verified_name ?? "",
      quality: health.quality_rating ?? undefined,
      tier: health.messaging_limit_tier ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
