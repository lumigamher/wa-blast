import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { appConfig } from "@/lib/db/schema";

export const DEFAULT_PLAN_PRICE_COP = 250000; // placeholder editable desde /admin
const KEY = "plan_price_cop";

export async function getPlanPriceCop(db: DB): Promise<number> {
  const row = (await db.select().from(appConfig).where(eq(appConfig.key, KEY)))[0];
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PLAN_PRICE_COP;
}

export async function setPlanPriceCop(db: DB, value: number): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Precio inválido");
  await db
    .insert(appConfig)
    .values({ key: KEY, value: String(Math.round(value)) })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: String(Math.round(value)) } });
}
