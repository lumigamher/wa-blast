// Valida la URL de reenvío de webhooks para evitar SSRF hacia la red interna.
// Riesgo residual: DNS rebinding tras guardar (se valida al guardar, no por envío).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    return low === "::1" || low === "::" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80") || low.startsWith("::ffff:127.") || low.startsWith("::ffff:10.") || low.startsWith("::ffff:192.168.");
  }
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

export async function validateForwardUrl(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "La URL no es válida." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Solo se permiten URLs http(s)." };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Ese host no está permitido." };
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, error: "No se permiten IPs privadas o reservadas." };
    return { ok: true };
  }
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.some((r) => isPrivateIp(r.address))) return { ok: false, error: "El dominio resuelve a una IP privada." };
  } catch {
    return { ok: false, error: "No pudimos resolver ese dominio." };
  }
  return { ok: true };
}
