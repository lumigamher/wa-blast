import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";

export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function monthlyCostCop(
  db: DB,
  orgId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${agentRuns.costCop}), 0)` })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.orgId, orgId),
        gte(agentRuns.createdAt, startOfMonth(now)),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function isOverCostCap(
  db: DB,
  orgId: string,
  capCop: number | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (capCop == null) return false;
  return (await monthlyCostCop(db, orgId, now)) >= capCop;
}
