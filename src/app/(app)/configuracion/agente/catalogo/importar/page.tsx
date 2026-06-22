import dynamicImport from "next/dynamic";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

const ImportProducts = dynamicImport(() => import("./_import").then((mod) => ({ default: mod.ImportProducts })));

export const dynamic = "force-dynamic";

export default function ImportarProductosPage() {
  return (
    <div className="space-y-4">
      <Link href="/configuracion/agente/catalogo" className="text-xs text-muted-foreground hover:underline">
        <ArrowLeftIcon className="inline size-3" /> Catálogo
      </Link>
      <h2 className="text-lg font-semibold">Importar productos (XLSX)</h2>
      <ImportProducts />
    </div>
  );
}
