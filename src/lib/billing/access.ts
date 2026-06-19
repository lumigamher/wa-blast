import { getSubscription } from "@/lib/billing/subscription";
import {
  type ModuleId,
  type PlanId,
  modulesForPlan,
  planHasModule,
} from "@/lib/billing/plans";
import type { DB } from "@/lib/db/client";

export type OrgAccess = {
  /** suscripción vigente (paidUntil futuro y no suspendida) */
  active: boolean;
  planId: PlanId;
  /** módulos efectivamente disponibles (vacío si no hay suscripción activa) */
  modules: Set<ModuleId>;
};

/**
 * Acceso efectivo del org: su plan y los módulos que puede usar.
 * Sin suscripción activa → modules vacío (todo gateado salvo core).
 */
export async function getOrgAccess(
  db: DB,
  orgId: string,
): Promise<OrgAccess> {
  const sub = await getSubscription(db, orgId);
  const planId = sub.planId;
  const active = sub.status === "active";
  const modules = new Set<ModuleId>(active ? modulesForPlan(planId) : []);
  return { active, planId, modules };
}

/** ¿El org puede usar este módulo? (requiere suscripción activa y plan que lo incluya). */
export async function checkModuleGate(
  db: DB,
  orgId: string,
  module: ModuleId,
): Promise<boolean> {
  const sub = await getSubscription(db, orgId);
  if (sub.status !== "active") return false;
  return planHasModule(sub.planId, module);
}
