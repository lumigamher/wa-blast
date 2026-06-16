"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { setCallingSettings } from "@/lib/meta/calling";

export async function saveCallingSettingsAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { orgId } = await requireOrg();
    const settings = await getOrgSettings(db, orgId);
    const status = formData.get("status") === "on" ? "ENABLED" : "DISABLED";
    // Solo enviar enums válidos: Meta rechaza cualquier otra cosa (p.ej. "NOT_SET").
    const call_icon_visibility =
      formData.get("call_icon_visibility") === "DISABLE_ALL" ? "DISABLE_ALL" : "DEFAULT";
    const r = await setCallingSettings(settings, {
      status,
      call_icon_visibility,
      callback_permission_status: formData.get("callback_permission") === "on" ? "ENABLED" : "DISABLED",
    });
    if ("error" in r) {
      return { ok: false, message: r.error };
    }
    revalidatePath("/configuracion/llamadas");
    return {
      ok: true,
      message:
        status === "ENABLED" ? "Llamadas habilitadas" : "Llamadas deshabilitadas",
    };
  } catch (e) {
    return {
      ok: false,
      message: `No se pudo guardar: ${e instanceof Error ? e.message : "error"}`,
    };
  }
}
