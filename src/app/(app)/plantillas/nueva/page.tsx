import { requireModuleAccess } from "@/lib/billing/require-module";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listFlows } from "@/lib/meta/flows";
import { credsFromSettings } from "@/lib/meta/graph";
import { getOrgSettings } from "@/lib/org/settings";
import { TemplateWizard } from "./template-wizard";

export const dynamic = "force-dynamic";

export default async function NuevaPlantillaPage() {
  await requireModuleAccess("plantillas");
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const configured = Boolean(settings.metaWabaId && settings.metaAccessToken);

  let flows: Array<{ id: string; name: string }> = [];
  if (configured) {
    try {
      const creds = credsFromSettings(settings);
      if (creds) {
        const allFlows = await listFlows(creds);
        flows = allFlows
          .filter((f) => f.status === "PUBLISHED")
          .map((f) => ({ id: f.id, name: f.name }));
      }
    } catch {
      // If flow fetch fails, continue without flows
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          <Link
            href="/plantillas"
            className="hover:underline flex items-center gap-1 w-fit"
          >
            <ArrowLeft className="size-3.5" /> Plantillas
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nueva plantilla
        </h1>
        <p className="text-sm text-muted-foreground">
          Se envía a Meta para aprobación. Queda en estado{" "}
          <code className="rounded bg-muted px-1">PENDING</code> hasta que Meta
          la revise (normalmente menos de 24h).
        </p>
      </header>
      {configured ? (
        <TemplateWizard flows={flows} />
      ) : (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Configura tus credenciales de Meta en{" "}
          <Link href="/configuracion/meta" className="underline">
            Configuración → Meta WhatsApp
          </Link>{" "}
          para crear plantillas.
        </div>
      )}
    </div>
  );
}
