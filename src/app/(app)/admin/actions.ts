"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { setPlanPriceCop } from "@/lib/billing/config";
import { applyCharge, setSuspended } from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";

export async function adminExtendAction(
  orgId: string,
  days: number,
): Promise<{ ok: true; error?: never } | { ok?: never; error: string }> {
  await requireAdmin();
  if (!Number.isFinite(days) || days <= 0 || days > 365) return { error: "Días inválidos" };
  await applyCharge(db, { orgId, chargeId: `manual_${randomUUID()}`, source: "manual", days });
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminSetSuspendedAction(
  orgId: string,
  suspended: boolean,
): Promise<{ ok: true; error?: never } | { ok?: never; error: string }> {
  await requireAdmin();
  await setSuspended(db, orgId, suspended);
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminSetPriceAction(
  priceCop: number,
): Promise<{ ok: true; error?: never } | { ok?: never; error: string }> {
  await requireAdmin();
  try {
    await setPlanPriceCop(db, priceCop);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/admin");
  return { ok: true };
}
