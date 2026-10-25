// Headers seguros para servir media subida por usuarios/clientes. El mime guardado viene de
// `file.type` (controlado por el cliente), así que solo se sirve inline una lista blanca;
// el resto (html, svg, xhtml, xml, js, vacío...) baja como descarga opaca. Evita XSS almacenado.

const INLINE_EXACTO = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const INLINE_FAMILIA = /^(audio|video)\/[a-z0-9][a-z0-9.+-]*$/;

function normalizarMime(mime: string): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

export function mediaServeHeaders(mime: string, bytes?: number, cacheControl?: string): Record<string, string> {
  const m = normalizarMime(mime);
  const inlineSeguro = INLINE_EXACTO.has(m) || INLINE_FAMILIA.test(m);
  const headers: Record<string, string> = {
    "content-type": inlineSeguro ? m : "application/octet-stream",
    "x-content-type-options": "nosniff",
  };
  if (!inlineSeguro) headers["content-disposition"] = "attachment";
  // El PDF queda sin sandbox: Chrome deja en blanco un PDF con CSP sandbox (visor integrado).
  // Sigue protegido por nosniff + content-type application/pdf.
  if (m !== "application/pdf") headers["content-security-policy"] = "sandbox; default-src 'none'";
  if (bytes !== undefined) headers["content-length"] = String(bytes);
  if (cacheControl) headers["cache-control"] = cacheControl;
  return headers;
}
