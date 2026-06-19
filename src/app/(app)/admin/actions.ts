"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { setPlanPriceCop } from "@/lib/billing/config";
import { isPlanId } from "@/lib/billing/plans";
import { applyCharge, setSuspended } from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";

export async function adminExtendAction(
  orgId: string,
  days: number,
): Promise<{ ok: true; error?: never } | { ok?: never; error: string }> {
  await requireAdmin();
  if (!Number.isFinite(days) || days <= 0 || days > 365)
    return { error: "Días inválidos" };
  await applyCharge(db, {
    orgId,
    chargeId: `manual_${randomUUID()}`,
    source: "manual",
    days,
  });
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
  planId: string,
  priceCop: number,
): Promise<{ ok: true; error?: never } | { ok?: never; error: string }> {
  await requireAdmin();
  try {
    // Validate planId is one of the allowed values
    if (!["esencial", "pro", "premium"].includes(planId)) {
      return { error: "Plan inválido" };
    }
    await setPlanPriceCop(
      db,
      planId as "esencial" | "pro" | "premium",
      priceCop,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminSetPlanAction(
  orgId: string,
  planId: string,
): Promise<{ ok: true; error?: never } | { ok?: never; error: string }> {
  await requireAdmin();
  if (!isPlanId(planId)) return { error: "Plan inválido" };
  const now = new Date();
  // Upsert: cambia el plan conservando estado/paidUntil (no cobra ni extiende).
  await db
    .insert(subscriptions)
    .values({ orgId, planId, status: "none", paidUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: { planId, updatedAt: now },
    });
  revalidatePath("/admin");
  return { ok: true };
}
