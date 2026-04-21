"use server";

import { revalidatePath } from "next/cache";
import { syncChatwootTemplates } from "@/lib/chatwoot-sync";
import { toggleFavorite as toggleInDb } from "@/lib/db";
import { getSession, requireAdmin } from "@/lib/session";

export type SyncResult = { ok: boolean; message: string };

export async function syncTemplatesAction(): Promise<SyncResult> {
  const user = await requireAdmin();
  if (!user) return { ok: false, message: "No autenticado" };

  const res = await syncChatwootTemplates();
  if (!res.ok) {
    return {
      ok: false,
      message: `No se pudo sincronizar: ${res.output.slice(-200)}`,
    };
  }
  revalidatePath("/plantillas");
  return {
    ok: true,
    message: "Plantillas sincronizadas en Chatwoot. Ya puedes enviar las aprobadas.",
  };
}

export type ToggleFavoriteResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string };

export async function toggleFavoriteAction(
  name: string,
  language: string,
): Promise<ToggleFavoriteResult> {
  const session = await getSession();
  if (!session.user) return { ok: false, error: "No autenticado" };
  if (!name || !language) return { ok: false, error: "Parámetros inválidos" };
  const res = toggleInDb(session.user.email, name, language);
  revalidatePath("/plantillas");
  revalidatePath("/nuevo-envio");
  return { ok: true, favorited: res.favorited };
}
