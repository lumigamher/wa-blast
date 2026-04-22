import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { TemplateForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NuevaPlantillaPage() {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const configured = Boolean(settings.metaWabaId && settings.metaAccessToken);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          <Link href="/plantillas" className="hover:underline">
            ← Plantillas
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva plantilla</h1>
        <p className="text-sm text-muted-foreground">
          Se envía a Meta para aprobación. Queda en estado <code className="rounded bg-muted px-1">PENDING</code> hasta
          que Meta la revise (normalmente menos de 24h).
        </p>
      </header>
      {configured ? (
        <TemplateForm />
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
