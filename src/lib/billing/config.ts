import { inArray } from "drizzle-orm";
import {
  type PlanDef,
  type PlanId,
  PLAN_IDS,
  PLANS,
} from "@/lib/billing/plans";
import type { DB } from "@/lib/db/client";
import { appConfig } from "@/lib/db/schema";

const PRICE_KEY: Record<PlanId, string> = {
  esencial: "plan_price_esencial",
  pro: "plan_price_pro",
  premium: "plan_price_premium",
};

export type PlanWithPrice = PlanDef & { priceCop: number };

/** Precio vigente de un plan: override de appConfig, o el default del catálogo. */
export async function getPlanPriceCop(db: DB, planId: PlanId): Promise<number> {
  const row = (
    await db
      .select()
      .from(appConfig)
      .where(inArray(appConfig.key, [PRICE_KEY[planId]]))
  )[0];
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : PLANS[planId].defaultPriceCop;
}

/** Todos los precios vigentes (override de appConfig sobre defaults). */
export async function getPlanPrices(db: DB): Promise<Record<PlanId, number>> {
  const rows = await db
    .select()
    .from(appConfig)
    .where(inArray(appConfig.key, Object.values(PRICE_KEY)));
  const byKey = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const out = {} as Record<PlanId, number>;
  for (const id of PLAN_IDS) {
    const v = byKey.get(PRICE_KEY[id]);
    out[id] =
      Number.isFinite(v) && (v as number) > 0
        ? (v as number)
        : PLANS[id].defaultPriceCop;
  }
  return out;
}

export async function setPlanPriceCop(
  db: DB,
  planId: PlanId,
  value: number,
): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Precio inválido");
  const key = PRICE_KEY[planId];
  await db
    .insert(appConfig)
    .values({ key, value: String(Math.round(value)) })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: String(Math.round(value)) },
    });
}

/** Catálogo con precios vigentes, orden ascendente. Para landing y /facturacion. */
export async function getPlanCatalog(db: DB): Promise<PlanWithPrice[]> {
  const prices = await getPlanPrices(db);
  return PLAN_IDS.map((id) => ({ ...PLANS[id], priceCop: prices[id] })).sort(
    (a, b) => a.order - b.order,
  );
}
