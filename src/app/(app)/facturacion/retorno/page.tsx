import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2Icon, LoaderIcon } from "lucide-react";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getSubscription } from "@/lib/billing/subscription";

export const dynamic = "force-dynamic";

export default async function BillingReturnPage() {
  const { orgId } = await requireOrg();
  const sub = await getSubscription(db, orgId);
  const isActive = sub.status === "active";

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isActive ? (
              <>
                <CheckCircle2Icon className="h-5 w-5 text-emerald-600" />
                ¡Suscripción activa!
              </>
            ) : (
              <>
                <LoaderIcon className="h-5 w-5 animate-spin text-amber-600" />
                Procesando tu pago…
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isActive ? (
            <>
              <p className="text-sm text-muted-foreground">
                Tu suscripción está activa y lista para usar. ¡Comienza a crear campañas ahora!
              </p>
              <Link href="/campanas/nueva">
                <Button className="w-full">Crear mi primera campaña</Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                La confirmación puede tardar unos segundos. Refresca esta página; si no se activa en unos minutos, escríbenos.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => location.reload()}
                  className="flex-1"
                >
                  Recargar
                </Button>
                <Link href="/facturacion" className="flex-1">
                  <Button variant="ghost" className="w-full">
                    Volver
                  </Button>
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
