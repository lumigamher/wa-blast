import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getSubscription } from "@/lib/billing/subscription";
import { getPlanPriceCop } from "@/lib/billing/config";
import { startCheckoutAction } from "./actions";
import { CheckoutForm } from "./_components/checkout-form";

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

export default async function BillingPage() {
  const { orgId } = await requireOrg();
  const sub = await getSubscription(db, orgId);
  const price = await getPlanPriceCop(db);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
        <p className="text-sm text-muted-foreground">Gestiona tu suscripción y pagos.</p>
      </header>

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
                <span className="text-red-600">
                  Suspendida — contáctanos
                </span>
              )}
              {sub.status === "none" && (
                <span className="text-muted-foreground">
                  Sin suscripción
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Lula</CardTitle>
          <CardDescription className="text-xs">
            Todo incluido: campañas, plantillas, carrusel y flows. Renueva cada 30 días.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Precio mensual</p>
            <p className="text-3xl font-bold">{formatPrice(price)}</p>
          </div>
          {sub.status !== "suspended" && (
            <CheckoutForm
              buttonLabel={sub.status === "active" ? "Extender 30 días" : "Activar suscripción"}
              action={startCheckoutAction}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
