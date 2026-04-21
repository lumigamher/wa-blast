import Link from "next/link";
import { env } from "@/lib/env";
import { TemplateForm } from "./form";

export const dynamic = "force-dynamic";

export default function NuevaPlantillaPage() {
  const metaConfigured = Boolean(env.META_WABA_ID && env.META_ACCESS_TOKEN);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          <Link href="/plantillas" className="hover:underline">
            ← Plantillas
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
      {metaConfigured ? (
        <TemplateForm />
      ) : (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Configura <code>META_WABA_ID</code> y <code>META_ACCESS_TOKEN</code>{" "}
          en <code>.env.local</code> y reinicia la app para crear plantillas.
        </div>
      )}
    </div>
  );
}
