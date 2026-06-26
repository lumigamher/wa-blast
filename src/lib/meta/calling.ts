import type { DecryptedSettings } from "@/lib/org/settings";
import { env } from "@/lib/env";

// Settings de calling probado en v22 (Fase 1). Las acciones de llamada
// (accept/reject/terminate) usan la versión configurable (default v24).
const GRAPH = "https://graph.facebook.com/v22.0";
const GRAPH_CALLS = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

export type CallingSettings = {
  status: "ENABLED" | "DISABLED";
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL";
  callback_permission_status?: "ENABLED" | "DISABLED";
};

/**
 * Meta devuelve "NOT_SET" (y a veces otros valores) cuando un campo nunca se
 * configuró; esos valores NO son enums válidos para reenviar en el POST.
 * Normaliza la respuesta cruda a nuestro tipo, descartando lo no-válido.
 */
export function normalizeCallingSettings(raw: Record<string, unknown> | undefined | null): CallingSettings {
  const status = raw?.status === "ENABLED" ? "ENABLED" : "DISABLED";
  const icon = raw?.call_icon_visibility;
  const callback = raw?.callback_permission_status;
  return {
    status,
    call_icon_visibility: icon === "DEFAULT" || icon === "DISABLE_ALL" ? icon : undefined,
    callback_permission_status: callback === "ENABLED" || callback === "DISABLED" ? callback : undefined,
  };
}

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
  const j = (await res.json()) as { calling?: Record<string, unknown> };
  return normalizeCallingSettings(j.calling);
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
  const res = await fetch(`${GRAPH_CALLS}/${s.metaPhoneId}/calls`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${s.metaAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
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

export async function requestCallPermission(
  s: DecryptedSettings,
  toPhone: string,
): Promise<{ ok: true } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) return { error: "Meta no configurado" };
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      type: "interactive",
      interactive: {
        type: "call_permission_request",
        body: { text: "¿Nos autorizas a llamarte por WhatsApp para atenderte mejor?" },
        action: { name: "call_permission_request" },
      },
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "No se pudo solicitar permiso" };
  }
  return { ok: true };
}

export async function placeCall(
  s: DecryptedSettings,
  offerSdp: string,
  toPhone: string,
): Promise<{ ok: true; callId: string } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) return { error: "Meta no configurado" };
  const res = await fetch(`${GRAPH_CALLS}/${s.metaPhoneId}/calls`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      action: "connect",
      session: { sdp: offerSdp, sdp_type: "offer" },
    }),
  });
  const rawRes = await res.text();
  console.log(`[placeCall] status=${res.status} to=${toPhone} body=${rawRes.slice(0, 400)}`);
  if (!res.ok) {
    const j = (() => {
      try {
        return JSON.parse(rawRes) as { error?: { message?: string } };
      } catch {
        return {} as { error?: { message?: string } };
      }
    })();
    return { error: j.error?.message ?? "No se pudo iniciar la llamada" };
  }
  const j = JSON.parse(rawRes) as { calls?: { id: string }[] };
  const callId = j.calls?.[0]?.id;
  if (!callId) return { error: "Meta no devolvió id de llamada" };
  return { ok: true, callId };
}
