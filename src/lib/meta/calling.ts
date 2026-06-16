import type { DecryptedSettings } from "@/lib/org/settings";
import { env } from "@/lib/env";

const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

export type CallingSettings = {
  status: "ENABLED" | "DISABLED";
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL";
  callback_permission_status?: "ENABLED" | "DISABLED";
};

export async function getCallingSettings(
  s: DecryptedSettings,
): Promise<CallingSettings | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) {
    return { error: "Meta no configurado" };
  }
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/settings`, {
    headers: { authorization: `Bearer ${s.metaAccessToken}` },
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "No se pudo leer la configuración" };
  }
  const j = (await res.json()) as { calling?: CallingSettings };
  return j.calling ?? { status: "DISABLED" };
}

export async function setCallingSettings(
  s: DecryptedSettings,
  patch: Partial<CallingSettings>,
): Promise<{ ok: true } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) {
    return { error: "Meta no configurado" };
  }
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/settings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${s.metaAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ calling: patch }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "No se pudo guardar" };
  }
  return { ok: true };
}

type CallActionBody = {
  call_id: string;
  action: "accept" | "reject" | "terminate";
  session?: { sdp: string; sdp_type: "answer" };
};

export async function callAction(
  s: DecryptedSettings,
  body: CallActionBody,
): Promise<{ ok: true } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) {
    return { error: "Meta no configurado" };
  }
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/calls`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${s.metaAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "Acción de llamada falló" };
  }
  return { ok: true };
}

export function acceptCall(s: DecryptedSettings, callId: string, answerSdp: string) {
  return callAction(s, { call_id: callId, action: "accept", session: { sdp: answerSdp, sdp_type: "answer" } });
}

export function rejectCall(s: DecryptedSettings, callId: string) {
  return callAction(s, { call_id: callId, action: "reject" });
}

export function terminateCall(s: DecryptedSettings, callId: string) {
  return callAction(s, { call_id: callId, action: "terminate" });
}
