import type { CreateCampaignInput } from "./create";

type FailedRow = {
  contactId: string | null;
  phone: string | null;
  bsuid: string | null;
  name: string | null;
  params: string;
};

/** Reconstruye los destinatarios de un reintento a partir de las filas fallidas (incluye bsuid). */
export function failedRowsToRecipients(rows: FailedRow[]): CreateCampaignInput["recipients"] {
  return rows.map((r) => ({
    contactId: r.contactId ?? undefined,
    phone: r.phone,
    bsuid: r.bsuid,
    name: r.name,
    params: JSON.parse(r.params) as Record<string, string>,
  }));
}
