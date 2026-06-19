import { eq } from "drizzle-orm";
import type { PlanId } from "@/lib/billing/plans";
import type { DB } from "@/lib/db/client";
import { subscriptionCharges, subscriptions } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
export const PERIOD_DAYS = 30;

export type SubscriptionState = {
  status: "none" | "active" | "expired" | "suspended";
  planId: PlanId;
  paidUntil: Date | null;
};

export async function getSubscription(
  db: DB,
  orgId: string,
): Promise<SubscriptionState> {
  const row = (
    await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId))
  )[0];
  const planId: PlanId = row?.planId ?? "esencial";
  if (!row) return { status: "none", planId, paidUntil: null };
  if (row.status === "suspended")
    return { status: "suspended", planId, paidUntil: row.paidUntil };
  if (!row.paidUntil) return { status: "none", planId, paidUntil: null };
  return row.paidUntil.getTime() > Date.now()
    ? { status: "active", planId, paidUntil: row.paidUntil }
    : { status: "expired", planId, paidUntil: row.paidUntil };
}

/**
 * Cambia el plan sin tocar el período (upgrades inmediatos ya cobrados).
 * Registra el cargo de prorrateo de forma idempotente.
 */
export async function setPlan(
  db: DB,
  input: {
    orgId: string;
    planId: PlanId;
    chargeId: string;
    source: "efipay" | "manual";
    amountCop?: number;
  },
): Promise<{ applied: boolean }> {
  const now = new Date();
  const inserted = await db
    .insert(subscriptionCharges)
    .values({
      id: input.chargeId,
      orgId: input.orgId,
      amountCop: input.amountCop ?? null,
      source: input.source,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return { applied: false };

  await db
    .update(subscriptions)
    .set({ planId: input.planId, updatedAt: now })
    .where(eq(subscriptions.orgId, input.orgId));
  return { applied: true };
}

export async function hasActiveSubscription(
  db: DB,
  orgId: string,
): Promise<boolean> {
  return (await getSubscription(db, orgId)).status === "active";
}

export async function applyCharge(
  db: DB,
  input: {
    orgId: string;
    chargeId: string;
    source: "efipay" | "manual";
    amountCop?: number;
    days?: number;
    planId?: PlanId;
  },
): Promise<{ applied: boolean; paidUntil: Date }> {
  const days = input.days ?? PERIOD_DAYS;
  const now = new Date();

  // Fetch existing subscription state before attempting to insert charge
  const existing = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, input.orgId))
  )[0];

  const inserted = await db
    .insert(subscriptionCharges)
    .values({
      id: input.chargeId,
      orgId: input.orgId,
      amountCop: input.amountCop ?? null,
      source: input.source,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    // Charge already applied, return the existing paidUntil
    const paidUntil = existing?.paidUntil ?? now;
    return { applied: false, paidUntil };
  }

  const base =
    existing?.paidUntil && existing.paidUntil.getTime() > now.getTime()
      ? existing.paidUntil
      : now;
  const paidUntil = new Date(base.getTime() + days * DAY_MS);

  await db
    .insert(subscriptions)
    .values({
      orgId: input.orgId,
      status: "active",
      paidUntil,
      updatedAt: now,
      ...(input.planId ? { planId: input.planId } : {}),
    })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: {
        status: "active",
        paidUntil,
        updatedAt: now,
        ...(input.planId ? { planId: input.planId } : {}),
      },
    });

  // Fetch back the actual paidUntil stored in the DB to ensure consistency
  const stored = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, input.orgId))
  )[0];
  const storedPaidUntil = stored?.paidUntil ?? paidUntil;

  return { applied: true, paidUntil: storedPaidUntil };
}

export async function setSuspended(
  db: DB,
  orgId: string,
  suspended: boolean,
): Promise<void> {
  const now = new Date();
  await db
    .insert(subscriptions)
    .values({
      orgId,
      status: suspended ? "suspended" : "active",
      paidUntil: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: { status: suspended ? "suspended" : "active", updatedAt: now },
    });
}
