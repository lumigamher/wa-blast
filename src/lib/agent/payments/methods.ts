import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { paymentMethods } from "@/lib/db/schema";

export type PaymentType = "nequi" | "daviplata" | "bre_b" | "transferencia" | "link";

export async function listPaymentMethods(db: DB, orgId: string, onlyEnabled = false) {
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.orgId, orgId))
    .orderBy(asc(paymentMethods.sortOrder));
  return onlyEnabled ? rows.filter((r) => r.enabled) : rows;
}

export async function addPaymentMethod(
  db: DB,
  orgId: string,
  input: { type: PaymentType; label: string; details: string },
): Promise<void> {
  if (!input.label.trim()) throw new Error("Etiqueta requerida");
  await db.insert(paymentMethods).values({
    id: randomUUID(),
    orgId,
    type: input.type,
    label: input.label.trim(),
    details: input.details ?? "",
    enabled: true,
    sortOrder: 0,
    createdAt: new Date(),
  });
}

export async function setPaymentMethodEnabled(
  db: DB,
  orgId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(paymentMethods)
    .set({ enabled })
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.orgId, orgId)));
}

export async function deletePaymentMethod(
  db: DB,
  orgId: string,
  id: string,
): Promise<void> {
  await db
    .delete(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.orgId, orgId)));
}
