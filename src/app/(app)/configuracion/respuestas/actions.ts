"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { createQuickReply, deleteQuickReply } from "@/lib/inbox/quick-replies";

export async function createQuickReplyAction(input: { shortcut: string; body: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { orgId } = await requireOrg();
    await createQuickReply(db, orgId, input);
    revalidatePath("/configuracion/respuestas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear respuesta" };
  }
}

export async function deleteQuickReplyAction(id: string): Promise<void> {
  const { orgId } = await requireOrg();
  await deleteQuickReply(db, orgId, id);
  revalidatePath("/configuracion/respuestas");
}
