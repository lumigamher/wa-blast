import type { DecryptedSettings } from "@/lib/org/settings";

export type SendTemplateParams = {
  to: string;
  templateName: string;
  language: string;
  components?: unknown[];
};

export type SendTextParams = {
  to: string;
  body: string;
  replyTo?: string;
};

export type SendFlowParams = {
  to: string;
  flowId: string;
  cta: string;
  bodyText: string;
};

export type MetaError = {
  code: number;
  message: string;
  type: "rate_limit" | "invalid_number" | "outside_24h" | "template_paused" | "auth" | "unknown";
};

export async function sendText(
  settings: DecryptedSettings,
  p: SendTextParams,
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken) {
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  }
  const url = `https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`;
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: p.to.replace(/^\+/, ""),
    type: "text",
    text: { body: p.body },
  };
  if (p.replyTo) payload.context = { message_id: p.replyTo };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.metaAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(body.error?.code, body.error?.message) };
  }
  const body = (await res.json()) as { messages: { id: string }[] };
  return { wamid: body.messages[0].id };
}

export async function sendTemplate(
  settings: DecryptedSettings,
  p: SendTemplateParams,
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken) {
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  }
  const url = `https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.metaAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: p.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: p.templateName,
        language: { code: p.language },
        components: p.components ?? [],
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(body.error?.code, body.error?.message) };
  }
  const body = (await res.json()) as { messages: { id: string }[] };
  return { wamid: body.messages[0].id };
}

export async function sendFlow(
  settings: DecryptedSettings,
  p: SendFlowParams,
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken) {
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  }
  const url = `https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`;
  const flowToken = `flow_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.metaAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: p.to.replace(/^\+/, ""),
      type: "interactive",
      interactive: {
        type: "flow",
        body: { text: p.bodyText },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_id: p.flowId,
            flow_token: flowToken,
            flow_cta: p.cta,
            flow_action: "navigate",
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(body.error?.code, body.error?.message) };
  }
  const body = (await res.json()) as { messages: { id: string }[] };
  return { wamid: body.messages[0].id };
}

export async function markRead(
  settings: DecryptedSettings,
  p: { wamid: string; typing?: boolean },
): Promise<{ ok: true } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const body: Record<string, unknown> = { messaging_product: "whatsapp", status: "read", message_id: p.wamid };
  if (p.typing) body.typing_indicator = { type: "text" };
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  return { ok: true };
}

export async function uploadMedia(
  settings: DecryptedSettings,
  p: { bytes: ArrayBuffer; mime: string; filename?: string },
): Promise<{ mediaId: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([p.bytes], { type: p.mime }), p.filename ?? "upload");
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}` },
    body: form,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  const j = (await res.json()) as { id: string };
  return { mediaId: j.id };
}

export async function sendMedia(
  settings: DecryptedSettings,
  p: { to: string; kind: "image" | "audio" | "video" | "document"; mediaId: string; caption?: string; filename?: string; replyTo?: string },
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const media: Record<string, unknown> = { id: p.mediaId };
  if (p.caption && (p.kind === "image" || p.kind === "video" || p.kind === "document")) media.caption = p.caption;
  if (p.filename && p.kind === "document") media.filename = p.filename;
  const body: Record<string, unknown> = { messaging_product: "whatsapp", to: p.to.replace(/^\+/, ""), type: p.kind, [p.kind]: media };
  if (p.replyTo) body.context = { message_id: p.replyTo };
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  const j = (await res.json()) as { messages: { id: string }[] };
  return { wamid: j.messages[0].id };
}

export async function sendReaction(
  settings: DecryptedSettings,
  p: { to: string; wamid: string; emoji: string },
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: p.to.replace(/^\+/, ""), type: "reaction", reaction: { message_id: p.wamid, emoji: p.emoji } }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  const j = (await res.json()) as { messages: { id: string }[] };
  return { wamid: j.messages[0].id };
}

function classify(code?: number, message?: string): MetaError {
  const msg = message ?? "unknown";
  if (code === 130429) return { code, message: msg, type: "rate_limit" };
  if (code === 131026 || code === 131047) return { code, message: msg, type: "outside_24h" };
  if (code === 132000 || code === 132001 || code === 132007)
    return { code: code, message: msg, type: "template_paused" };
  if (code === 190 || code === 10) return { code: code, message: msg, type: "auth" };
  if (code === 131008) return { code: code, message: msg, type: "invalid_number" };
  return { code: code ?? 0, message: msg, type: "unknown" };
}
