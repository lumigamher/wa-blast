"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { getPlanPriceCop } from "@/lib/billing/config";
import { createCheckout, efipayCredsFromEnv } from "@/lib/billing/efipay";
import { db } from "@/lib/db/client";
import { billingCheckouts } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function startCheckoutAction(): Promise<{ error: string } | never> {
  const { orgId } = await requireOrg();
  const creds = efipayCredsFromEnv();
  if (!creds) {
    return { error: "Pagos en línea aún no configurados. Escríbenos para activar tu suscripción manualmente." };
  }
  const price = await getPlanPriceCop(db);
  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;

  try {
    const { checkoutUrl, transactionId } = await createCheckout(creds, {
      amountCop: price,
      description: "Suscripción mensual wa-blast",
      webhookUrl: `${base}/api/webhook/efipay`,
    });
    await db.insert(billingCheckouts).values({ id: transactionId, orgId, createdAt: new Date() });
    redirect(checkoutUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear el pago";
    return { error: `No pudimos procesar tu pago: ${message}` };
  }
}
