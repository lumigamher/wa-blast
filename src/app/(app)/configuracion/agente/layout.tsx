import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireModuleAccess } from "@/lib/billing/require-module";

export default async function AgenteLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("agente");
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Agente IA</h1>
        <p className="text-sm text-muted-foreground">
          Configura y controla el comportamiento de tu asistente automático.
        </p>
      </header>
      {children}
    </div>
  );
}
