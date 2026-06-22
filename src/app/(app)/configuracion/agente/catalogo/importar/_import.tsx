"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  parseProductsFile, validateProductRows, buildProductsTemplate,
  type ProductValidation,
} from "@/lib/agent/catalog/import";
import { importProductsAction } from "../../actions";

export function ImportProducts() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState("");
  const [validation, setValidation] = useState<ProductValidation | null>(null);

  function downloadTemplate() {
    const buf = buildProductsTemplate();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-productos.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows } = await parseProductsFile(file);
      setFileName(file.name);
      setValidation(validateProductRows(rows));
    } catch {
      toast.error("No pude leer el archivo");
    }
    e.target.value = "";
  }

  function confirmImport() {
    if (!validation) return;
    startTransition(async () => {
      const res = await importProductsAction(validation.valid);
      if ("error" in res) { toast.error(res.error); return; }
      const s = res.summary;
      toast.success(`Importado: ${s.productsCreated + s.productsUpdated} productos, ${s.variantsCreated + s.variantsUpdated} variantes`);
      router.push("/configuracion/agente/catalogo");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1 · Plantilla y archivo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <DownloadIcon className="size-4 mr-1.5" /> Descargar plantilla
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
            <span className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted">
              <UploadIcon className="size-4" /> Subir XLSX
            </span>
          </label>
        </div>

        {validation && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">{fileName}</p>
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-600">{validation.productCount} productos</span>
              <span className="text-blue-600">{validation.variantCount} variantes</span>
              <span className="text-red-600">{validation.invalid.length} inválidas</span>
            </div>
            {validation.invalid.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-xs space-y-1 max-h-40 overflow-auto">
                {validation.invalid.slice(0, 10).map((inv) => (
                  <div key={inv.row}>Fila {inv.row}: {inv.error}</div>
                ))}
                {validation.invalid.length > 10 && <div>… y {validation.invalid.length - 10} más</div>}
              </div>
            )}
            <Button onClick={confirmImport} disabled={isPending || validation.valid.length === 0} size="sm">
              {isPending ? "Importando…" : `Importar ${validation.productCount} productos`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
