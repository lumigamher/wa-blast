"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { checkSubscriptionGate } from "@/lib/billing/gate";
import { db } from "@/lib/db/client";
import { getLastInboundWamid, getThread, markConversationRead, recordOutboundMessage } from "@/lib/inbox/store";
import { upsertReaction } from "@/lib/inbox/reactions";
import { isWindowOpen } from "@/lib/inbox/window";
import { markRead, sendMedia, sendReaction, sendTemplate, sendText, uploadMedia } from "@/lib/meta/client";
import { getOrgSettings } from "@/lib/org/settings";
import { saveMediaAsset } from "@/lib/media/store";

export type SendResult = { ok: true } | { ok: false; error: string; windowClosed?: boolean };

export async function sendMessageAction(
  conversationId: string,
  body: string,
  opts?: { replyTo?: string },
): Promise<SendResult> {
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
  const r = await sendText(settings, { to: thread.conversation.phone, body, replyTo: opts?.replyTo });

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

  // Best-effort: call Meta markRead with last inbound wamid + typing
  try {
    const settings = await getOrgSettings(db, orgId);
    const wamid = await getLastInboundWamid(db, orgId, conversationId);
    if (wamid) {
      await markRead(settings, { wamid, typing: true });
    }
  } catch {
    // Ignore errors from Meta call; local mark as read already succeeded
  }
}

export async function sendMediaAction(
  conversationId: string,
  input: { kind: "image" | "audio" | "video" | "document"; dataBase64: string; mime: string; filename?: string; caption?: string; replyTo?: string },
): Promise<SendResult> {
  const { orgId } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };

  const settings = await getOrgSettings(db, orgId);

  // Decode base64 to ArrayBuffer
  const binaryString = atob(input.dataBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const arrayBuffer = bytes.buffer;

  // Upload media
  const uploadRes = await uploadMedia(settings, { bytes: arrayBuffer, mime: input.mime, filename: input.filename });
  if ("error" in uploadRes) {
    await recordOutboundMessage(db, {
      orgId,
      conversationId,
      wamid: null,
      type: input.kind,
      body: input.caption ?? null,
      status: "failed",
      errorMessage: uploadRes.error.message,
    });
    return { ok: false, error: `No se pudo subir el archivo: ${uploadRes.error.message}` };
  }

  // Send media
  const sendRes = await sendMedia(settings, {
    to: thread.conversation.phone,
    kind: input.kind,
    mediaId: uploadRes.mediaId,
    caption: input.caption,
    filename: input.filename,
    replyTo: input.replyTo,
  });

  if ("error" in sendRes) {
    await recordOutboundMessage(db, {
      orgId,
      conversationId,
      wamid: null,
      type: input.kind,
      body: input.caption ?? null,
      status: "failed",
      errorMessage: sendRes.error.message,
    });
    return { ok: false, error: `No se pudo enviar: ${sendRes.error.message}` };
  }

  const asset = await saveMediaAsset(db, { orgId, bytes: arrayBuffer, mime: input.mime, kind: input.kind });
  await recordOutboundMessage(db, {
    orgId, conversationId, wamid: sendRes.wamid, type: input.kind,
    body: input.caption ?? null, status: "sent", mediaId: asset.id,
  });

  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

export async function sendReactionAction(
  conversationId: string,
  input: { wamid: string; emoji: string },
): Promise<SendResult> {
  const { orgId } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };

  const settings = await getOrgSettings(db, orgId);
  const sendRes = await sendReaction(settings, { to: thread.conversation.phone, wamid: input.wamid, emoji: input.emoji });
  if ("error" in sendRes) return { ok: false, error: `No se pudo enviar la reacción: ${sendRes.error.message}` };

  await upsertReaction(db, { orgId, conversationId, targetWamid: input.wamid, direction: "out", emoji: input.emoji });
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}
