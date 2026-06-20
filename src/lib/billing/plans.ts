// Catálogo de planes y módulos. El mapeo módulos↔plan vive aquí (código);
// los precios tienen defaults aquí pero pueden sobreescribirse desde appConfig
// (ver config.ts → getPlanCatalog). Fuente de verdad de precios = appConfig.

export type PlanId = "esencial" | "pro" | "premium";

export type ModuleId =
  | "campanas"
  | "inbox"
  | "plantillas"
  | "contactos"
  | "flows"
  | "carrusel"
  | "llamadas"
  | "agente";

export const PLAN_IDS: readonly PlanId[] = ["esencial", "pro", "premium"];

export type PlanDef = {
  id: PlanId;
  name: string;
  /** orden ascendente: 1 = más bajo */
  order: number;
  /** precio mensual COP por defecto (editable desde /admin) */
  defaultPriceCop: number;
  /** módulos desbloqueados (acumulativos por convención del reparto) */
  modules: readonly ModuleId[];
  /** copy corto para la landing */
  tagline: string;
};

const ESENCIAL_MODULES: readonly ModuleId[] = [
  "campanas",
  "inbox",
  "plantillas",
  "contactos",
];
const PRO_MODULES: readonly ModuleId[] = [
  ...ESENCIAL_MODULES,
  "flows",
  "carrusel",
];
const PREMIUM_MODULES: readonly ModuleId[] = [...PRO_MODULES, "llamadas", "agente"];

export const PLANS: Record<PlanId, PlanDef> = {
  esencial: {
    id: "esencial",
    name: "Esencial",
    order: 1,
    defaultPriceCop: 49997,
    modules: ESENCIAL_MODULES,
    tagline: "Para empezar a vender por WhatsApp",
  },
  pro: {
    id: "pro",
    name: "Pro",
    order: 2,
    defaultPriceCop: 70997,
    modules: PRO_MODULES,
    tagline: "Automatiza con formularios IA y carrusel",
  },
  premium: {
    id: "premium",
    name: "Premium",
    order: 3,
    defaultPriceCop: 99997,
    modules: PREMIUM_MODULES,
    tagline: "Todo incluido, con llamadas",
  },
};

export const MODULE_LABELS: Record<ModuleId, string> = {
  campanas: "Campañas masivas",
  inbox: "Bandeja de entrada",
  plantillas: "Plantillas",
  contactos: "Contactos",
  flows: "Formularios con IA",
  carrusel: "Campañas carrusel",
  llamadas: "Llamadas",
  agente: "Agente IA",
};

/** Prefijos de ruta que cada módulo protege (gating por ruta). */
export const MODULE_ROUTES: Record<ModuleId, readonly string[]> = {
  campanas: ["/campanas"],
  inbox: ["/inbox"],
  plantillas: ["/plantillas"],
  contactos: ["/contactos"],
  flows: ["/flows"],
  carrusel: [], // gateado dentro del wizard, no por ruta
  llamadas: ["/llamadas"],
  agente: ["/configuracion/agente"],
};

export function getPlan(id: PlanId): PlanDef {
  return PLANS[id];
}

export function planRank(id: PlanId): number {
  return PLANS[id].order;
}

export function planHasModule(id: PlanId, module: ModuleId): boolean {
  return PLANS[id].modules.includes(module);
}

export function modulesForPlan(id: PlanId): readonly ModuleId[] {
  return PLANS[id].modules;
}

/** Planes a los que un org puede subir desde su plan actual (rank mayor). */
export function upgradeTargets(current: PlanId): PlanDef[] {
  const rank = planRank(current);
  return PLAN_IDS.filter((p) => planRank(p) > rank).map((p) => PLANS[p]);
}

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Prorrateo de un upgrade: diferencia de precio mensual escalada por los días
 * que faltan del ciclo. Mínimo 0. Redondeado a peso.
 */
export function proratedUpgradeCop(input: {
  currentPriceCop: number;
  targetPriceCop: number;
  remainingDays: number;
  periodDays: number;
}): number {
  const { currentPriceCop, targetPriceCop, remainingDays, periodDays } = input;
  const diff = targetPriceCop - currentPriceCop;
  if (diff <= 0 || remainingDays <= 0 || periodDays <= 0) return 0;
  const capped = Math.min(remainingDays, periodDays);
  return Math.round((diff * capped) / periodDays);
}
