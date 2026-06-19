import { Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/session";
import { getPlanCatalog } from "@/lib/billing/config";
import {
  MODULE_LABELS,
  type ModuleId,
  PLANS,
  planHasModule,
  upgradeTargets,
} from "@/lib/billing/plans";
import { getSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";
import { CheckoutForm } from "./_components/checkout-form";
import { startCheckoutAction, upgradeAction } from "./actions";

export const dynamic = "force-dynamic";

const locale = "es-CO";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await requireOrg();
  const sub = await getSubscription(db, orgId);
  const catalog = await getPlanCatalog(db);
  const params = await searchParams;
  const upgradeModule =
    typeof params.upgrade === "string" ? params.upgrade : undefined;
  const upgraded = params.upgraded === "1";

  // Determine minimum plan for the upgrade module
  let upgradeTargetId: string | undefined;
  if (upgradeModule) {
    const mod = upgradeModule as ModuleId;
    for (const planId of ["esencial", "pro", "premium"] as const) {
      if (planHasModule(planId, mod)) {
        upgradeTargetId = planId;
        break;
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona tu suscripción y pagos.
        </p>
      </header>

      {upgraded && (
        <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-500">
          Plan actualizado con éxito.
        </div>
      )}

      {upgradeModule && (
        <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-500">
          Tu plan actual no incluye {MODULE_LABELS[upgradeModule as ModuleId]}.
          Mejora tu plan para activarlo.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado de la suscripción</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Estado</p>
            <p className="mt-1 text-lg font-medium">
              {sub.status === "active" && (
                <span className="text-emerald-600">
                  Activa hasta el {formatDate(sub.paidUntil!)}
                </span>
              )}
              {sub.status === "expired" && (
                <span className="text-amber-600">
                  Venció el {formatDate(sub.paidUntil!)}
                </span>
              )}
              {sub.status === "suspended" && (
                <span className="text-red-600">Suspendida — contáctanos</span>
              )}
              {sub.status === "none" && (
                <span className="text-muted-foreground">Sin suscripción</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {sub.status === "active" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Plan actual: {PLANS[sub.planId].name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Módulos incluidos:
              </p>
              <div className="space-y-2">
                {PLANS[sub.planId].modules.map((mod) => (
                  <div key={mod} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-emerald-600" />
                    {MODULE_LABELS[mod]}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {sub.status === "active" && upgradeTargets(sub.planId).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Mejora tu plan</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {upgradeTargets(sub.planId).map((plan) => {
              const currentModules = new Set(PLANS[sub.planId].modules);
              const newModules = plan.modules.filter(
                (m) => !currentModules.has(m),
              );
              const price =
                catalog.find((p) => p.id === plan.id)?.priceCop ?? 0;
              const currentPrice =
                catalog.find((p) => p.id === sub.planId)?.priceCop ?? 0;
              // eslint-disable-next-line react-hooks/purity -- server component: se evalúa una vez por petición
              const nowMs = Date.now();
              const remainingDays = sub.paidUntil
                ? Math.max(
                    0,
                    Math.ceil(
                      (sub.paidUntil.getTime() - nowMs) /
                        (24 * 60 * 60 * 1000),
                    ),
                  )
                : 0;
              const prorated = Math.max(
                0,
                Math.round(((price - currentPrice) * remainingDays) / 30),
              );
              const isHighlighted = upgradeTargetId === plan.id;

              return (
                <Card
                  key={plan.id}
                  className={
                    isHighlighted
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
                      : ""
                  }
                >
                  <CardHeader>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {plan.tagline}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Precio mensual
                      </p>
                      <p className="text-2xl font-bold">{formatPrice(price)}</p>
                    </div>
                    {prorated > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Costo prorrateado: {formatPrice(prorated)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Nuevos módulos:
                      </p>
                      <div className="space-y-1">
                        {newModules.length > 0 ? (
                          newModules.map((mod) => (
                            <div
                              key={mod}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                              {MODULE_LABELS[mod]}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Todos ya están incluidos
                          </p>
                        )}
                      </div>
                    </div>
                    <CheckoutForm
                      buttonLabel={`Subir a ${plan.name}`}
                      action={upgradeAction}
                      planId={plan.id}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {sub.status !== "active" && sub.status !== "suspended" && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Elige tu plan</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {catalog.map((plan) => {
              const isHighlighted = upgradeTargetId === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={
                    isHighlighted
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
                      : ""
                  }
                >
                  <CardHeader>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {plan.tagline}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Precio mensual
                      </p>
                      <p className="text-2xl font-bold">
                        {formatPrice(plan.priceCop)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Módulos incluidos:
                      </p>
                      <div className="space-y-1">
                        {plan.modules.map((mod) => (
                          <div
                            key={mod}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Check className="h-4 w-4 text-emerald-600" />
                            {MODULE_LABELS[mod]}
                          </div>
                        ))}
                      </div>
                    </div>
                    <CheckoutForm
                      buttonLabel="Suscribirme"
                      action={startCheckoutAction}
                      planId={plan.id}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
