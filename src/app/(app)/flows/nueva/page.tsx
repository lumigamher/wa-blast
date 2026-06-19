import { requireModuleAccess } from "@/lib/billing/require-module";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getOrgSettings } from "@/lib/org/settings";
import { FlowForm } from "./flow-form";

export const dynamic = "force-dynamic";

export default async function NuevaFlowPage() {
  await requireModuleAccess("flows");
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const configured = Boolean(settings.metaWabaId && settings.metaAccessToken);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          <Link
            href="/flows"
            className="hover:underline flex items-center gap-1 w-fit"
          >
            <ArrowLeft className="size-3.5" /> Flows
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo Flow</h1>
        <p className="text-sm text-muted-foreground">
          Crea un formulario interactivo (Flow) para captura de leads. Se
          publica en Meta y queda listo para enviar.
        </p>
      </header>
      {configured ? (
        <FlowForm />
      ) : (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Configura tus credenciales de Meta en{" "}
          <Link href="/configuracion/meta" className="underline">
            Configuración → Meta WhatsApp
          </Link>{" "}
          para crear Flows.
        </div>
      )}
    </div>
  );
}
