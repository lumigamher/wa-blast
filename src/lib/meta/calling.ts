import type { DecryptedSettings } from "@/lib/org/settings";

const GRAPH = "https://graph.facebook.com/v22.0";

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
