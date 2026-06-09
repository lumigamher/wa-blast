import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings } from "@/lib/meta/graph";
import { listFlows, type Flow } from "@/lib/meta/flows";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function FlowsPage() {
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
        {configured && (
          <Link href="/flows/nueva">
            <Button size="sm">Nueva</Button>
          </Link>
        )}
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
          <p className="text-sm text-muted-foreground">Aún no tienes Flows. Crea el primero.</p>
          <Link href="/flows/nueva" className="mt-4 inline-block">
            <Button>Crear Flow</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => (
            <Card key={flow.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-medium text-sm">{flow.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {flow.categories?.map((cat: string) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Badge variant={flow.status === "PUBLISHED" ? "default" : "secondary"} className="text-xs">
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
