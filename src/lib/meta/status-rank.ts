export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";

const RANK: Record<Exclude<DeliveryStatus, "failed">, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * ¿El estado `next` debe reemplazar al `current`? Solo avanza (pending < sent < delivered < read).
 * `failed` es terminal: solo aplica desde pending/sent (o sin estado previo). Los webhooks de Meta
 * llegan desordenados: un `delivered` tardío nunca debe pisar un `read`.
 */
export function shouldAdvanceStatus(current: string | null | undefined, next: DeliveryStatus): boolean {
  if (current == null) return true;
  if (current === "failed") return false;
  const cur = RANK[current as keyof typeof RANK];
  if (cur === undefined) return true; // estado desconocido: no bloquear
  if (next === "failed") return cur <= RANK.sent;
  return RANK[next] > cur;
}
