"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { getPlanPriceCop } from "@/lib/billing/config";
import { createCheckout, efipayCredsFromEnv } from "@/lib/billing/efipay";
import {
  isPlanId,
  type PlanId,
  planRank,
  proratedUpgradeCop,
} from "@/lib/billing/plans";
import {
  getSubscription,
  PERIOD_DAYS,
  setPlan,
} from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";
import { billingCheckouts } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function startCheckoutAction(
  planId?: string,
): Promise<{ error: string } | never> {
  const { orgId } = await requireOrg();

  // Validate planId
  const validPlanId: PlanId =
    planId && isPlanId(planId) ? (planId as PlanId) : "esencial";

  const creds = efipayCredsFromEnv();
  if (!creds) {
    return {
      error:
        "Pagos en línea aún no configurados. Escríbenos para activar tu suscripción manualmente.",
    };
  }
  const price = await getPlanPriceCop(db, validPlanId);
  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;

  let checkoutUrl: string;
  try {
    const result = await createCheckout(creds, {
      amountCop: price,
      description: `Suscripción mensual Lula — ${validPlanId}`,
      webhookUrl: `${base}/api/webhook/efipay`,
      returnUrl: `${base}/facturacion/retorno`,
      reference: orgId,
    });
    await db.insert(billingCheckouts).values({
      id: result.transactionId,
      orgId,
      planId: validPlanId,
      kind: "subscription",
      amountCop: price,
      createdAt: new Date(),
    });
    checkoutUrl = result.checkoutUrl;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al crear el pago";
    return { error: `No pudimos procesar tu pago: ${message}` };
  }
  // redirect lanza NEXT_REDIRECT — debe quedar fuera del try/catch
  redirect(checkoutUrl);
}

export async function upgradeAction(
  targetPlanId?: string,
): Promise<{ error: string } | never> {
  const { orgId } = await requireOrg();

  // Validate targetPlanId
  if (!targetPlanId || !isPlanId(targetPlanId)) {
    return { error: "Plan inválido" };
  }
  const validTargetPlanId = targetPlanId as PlanId;

  const sub = await getSubscription(db, orgId);
  if (sub.status !== "active") {
    return {
      error: "Necesitas una suscripción activa para mejorar tu plan.",
    };
  }

  if (planRank(validTargetPlanId) <= planRank(sub.planId)) {
    return { error: "Ese plan no es una mejora." };
  }

  const currentPrice = await getPlanPriceCop(db, sub.planId);
  const targetPrice = await getPlanPriceCop(db, validTargetPlanId);

  const remainingDays = sub.paidUntil
    ? Math.max(
        0,
        Math.ceil(
          (sub.paidUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : 0;

  const prorated = proratedUpgradeCop({
    currentPriceCop: currentPrice,
    targetPriceCop: targetPrice,
    remainingDays,
    periodDays: PERIOD_DAYS,
  });

  // If prorated <= 0, apply immediately without EfiPay
  if (prorated <= 0) {
    await setPlan(db, {
      orgId,
      planId: validTargetPlanId,
      chargeId: `manual_upgrade_${orgId}_${Date.now()}`,
      source: "manual",
    });
    redirect("/facturacion?upgraded=1");
  }

  // Otherwise, create EfiPay checkout
  const creds = efipayCredsFromEnv();
  if (!creds) {
    return {
      error:
        "Pagos en línea aún no configurados. Escríbenos para procesar tu upgrade.",
    };
  }

  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;

  let checkoutUrl: string;
  try {
    const result = await createCheckout(creds, {
      amountCop: prorated,
      description: `Mejora a plan ${validTargetPlanId} (prorrateado)`,
      webhookUrl: `${base}/api/webhook/efipay`,
      returnUrl: `${base}/facturacion/retorno`,
      reference: orgId,
    });
    await db.insert(billingCheckouts).values({
      id: result.transactionId,
      orgId,
      planId: validTargetPlanId,
      kind: "upgrade",
      amountCop: prorated,
      createdAt: new Date(),
    });
    checkoutUrl = result.checkoutUrl;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al crear el pago";
    return { error: `No pudimos procesar tu upgrade: ${message}` };
  }
  // redirect lanza NEXT_REDIRECT — debe quedar fuera del try/catch
  redirect(checkoutUrl);
}
