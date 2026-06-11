import type { DB } from "@/lib/db/client";
import { hasActiveSubscription } from "@/lib/billing/subscription";

export const SUB_REQUIRED_MSG =
  "Tu organización no tiene una suscripción activa. Actívala en Facturación para poder enviar.";

export type GateResult = { ok: true } | { ok: false; error: string };

export async function checkSubscriptionGate(db: DB, orgId: string): Promise<GateResult> {
  if (await hasActiveSubscription(db, orgId)) return { ok: true };
  return { ok: false, error: SUB_REQUIRED_MSG };
}
