/**
 * A quién se le manda un mensaje por la Cloud API.
 *
 * Un usuario que adoptó username puede no tener teléfono visible nunca, así que
 * el destinatario no puede ser un `string`. Este tipo es el único que aceptan
 * las funciones de envío, y `recipientFields` es el único lugar que traduce a
 * los campos del request.
 */
export type Recipient = {
  phone?: string | null;
  bsuid?: string | null;
};

/**
 * `to` con teléfono, `recipient` con BSUID.
 *
 * Se prefiere el teléfono cuando existe: Meta le da precedencia si se mandan
 * ambos, así que enviarlo solo a él evita ambigüedad y deja intacto el
 * comportamiento del tráfico que ya funciona.
 */
export function recipientFields(r: Recipient): { to: string } | { recipient: string } {
  const phone = r.phone?.trim();
  if (phone) return { to: phone.replace(/^\+/, "") };
  const bsuid = r.bsuid?.trim();
  if (bsuid) return { recipient: bsuid };
  throw new Error("Sin destinatario: la conversación no tiene teléfono ni BSUID.");
}

/** Construye un Recipient desde una fila de conversación o contacto. */
export function recipientFrom(row: { phone?: string | null; bsuid?: string | null }): Recipient {
  return { phone: row.phone ?? null, bsuid: row.bsuid ?? null };
}

/**
 * Acepta el `string` de teléfono que usan los llamadores de siempre o un
 * `Recipient` completo. Permite introducir BSUID sin reescribir las decenas de
 * sitios que ya mandan un teléfono y funcionan.
 */
export function addressFields(to: string | Recipient): { to: string } | { recipient: string } {
  return typeof to === "string" ? recipientFields({ phone: to }) : recipientFields(to);
}
