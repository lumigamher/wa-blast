"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { checkSubscriptionGate } from "@/lib/billing/gate";
import { db } from "@/lib/db/client";
import { getThread, markConversationRead, recordOutboundMessage } from "@/lib/inbox/store";
import { isWindowOpen } from "@/lib/inbox/window";
import { sendTemplate, sendText } from "@/lib/meta/client";
import { getOrgSettings } from "@/lib/org/settings";

export type SendResult = { ok: true } | { ok: false; error: string; windowClosed?: boolean };

export async function sendMessageAction(conversationId: string, body: string): Promise<SendResult> {
  const { orgId } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!body.trim()) return { ok: false, error: "Escribe un mensaje" };

  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };

  if (!isWindowOpen(thread.conversation.lastIncomingAt)) {
    return { ok: false, error: "La ventana de 24h está cerrada. Usa una plantilla.", windowClosed: true };
  }

  const settings = await getOrgSettings(db, orgId);
  const r = await sendText(settings, { to: thread.conversation.phone, body });

  if ("error" in r) {
    await recordOutboundMessage(db, {
      orgId,
      conversationId,
      wamid: null,
      type: "text",
      body,
      status: "failed",
      errorMessage: r.error.message,
    });
    return { ok: false, error: `No se pudo enviar: ${r.error.message}` };
  }

  await recordOutboundMessage(db, {
    orgId,
    conversationId,
    wamid: r.wamid,
    type: "text",
    body,
    status: "sent",
  });

  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

export async function sendTemplateToConversationAction(
  conversationId: string,
  input: { templateName: string; language: string; params: string[] },
): Promise<SendResult> {
  const { orgId } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };

  const settings = await getOrgSettings(db, orgId);
  const components = input.params.length
    ? [{ type: "body", parameters: input.params.map((t) => ({ type: "text", text: t })) }]
    : [];

  const r = await sendTemplate(settings, {
    to: thread.conversation.phone,
    templateName: input.templateName,
    language: input.language,
    components,
  });

  if ("error" in r) {
    await recordOutboundMessage(db, {
      orgId,
      conversationId,
      wamid: null,
      type: "template",
      body: `[plantilla ${input.templateName}]`,
      status: "failed",
      errorMessage: r.error.message,
    });
    return { ok: false, error: `No se pudo enviar: ${r.error.message}` };
  }

  await recordOutboundMessage(db, {
    orgId,
    conversationId,
    wamid: r.wamid,
    type: "template",
    body: `[plantilla ${input.templateName}]`,
    status: "sent",
  });

  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

export async function markReadAction(conversationId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await markConversationRead(db, orgId, conversationId);
}
