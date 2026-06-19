import { requireModuleAccess } from "@/lib/billing/require-module";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { type Flow, listFlows } from "@/lib/meta/flows";
import { credsFromSettings } from "@/lib/meta/graph";
import { getOrgSettings } from "@/lib/org/settings";
import { SendFlowForm } from "./send-flow-form";

export const dynamic = "force-dynamic";

export default async function FlowsPage() {
  await requireModuleAccess("flows");
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const configured = Boolean(settings.metaWabaId && settings.metaAccessToken);

  let flows: Flow[] = [];
  if (configured) {
    const creds = credsFromSettings(settings);
    if (creds) {
      flows = await listFlows(creds).catch(() => []);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Flows</h1>
        <div className="flex items-center gap-2">
          <Link href="/flows/respuestas">
            <Button size="sm" variant="outline">
              Respuestas
            </Button>
          </Link>
          {configured && (
            <Link href="/flows/nueva">
              <Button size="sm">Nueva</Button>
            </Link>
          )}
        </div>
      </div>

      {!configured ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Configura tus credenciales de Meta en{" "}
          <Link href="/configuracion/meta" className="underline">
            Configuración → Meta WhatsApp
          </Link>{" "}
          para crear y gestionar Flows.
        </div>
      ) : flows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no tienes Flows. Crea el primero.
          </p>
          <Link href="/flows/nueva" className="mt-4 inline-block">
            <Button>Crear Flow</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => (
            <Card key={flow.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="font-medium text-sm">{flow.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {flow.categories?.map((cat: string) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                  {flow.status === "PUBLISHED" && (
                    <SendFlowForm flowId={flow.id} flowName={flow.name} />
                  )}
                </div>
                <Badge
                  variant={
                    flow.status === "PUBLISHED" ? "default" : "secondary"
                  }
                  className="text-xs"
                >
                  {flow.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
