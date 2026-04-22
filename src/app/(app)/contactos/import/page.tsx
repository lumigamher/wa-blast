"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckCircle2Icon, UploadIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dryRunImportAction, confirmImportAction } from "../actions";

type Preview = Awaited<ReturnType<typeof dryRunImportAction>>;

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phoneCol, setPhoneCol] = useState("phone");
  const [nameCol, setNameCol] = useState("name");
  const [emailCol, setEmailCol] = useState("email");
  const [customCols, setCustomCols] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDryRun() {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("phoneCol", phoneCol);
    fd.set("nameCol", nameCol);
    fd.set("emailCol", emailCol);
    fd.set("customCols", customCols);
    const res = await dryRunImportAction(fd);
    setPreview(res);
    setLoading(false);
  }

  async function handleConfirm() {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("phoneCol", phoneCol);
    fd.set("nameCol", nameCol);
    fd.set("emailCol", emailCol);
    fd.set("customCols", customCols);
    await confirmImportAction(fd);
    setLoading(false);
    router.push("/contactos");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/contactos" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Contactos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Importar contactos</h1>
        <p className="text-sm text-muted-foreground">
          Sube un CSV o Excel con tus contactos. Los duplicados se actualizan sin sobrescribir opt-outs.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Sube el archivo</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-md border border-dashed p-8 text-sm hover:bg-muted/30">
            <UploadIcon className="size-5 text-muted-foreground" />
            <div>
              {file ? (
                <div>
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{Math.round(file.size / 1024)} KB</div>
                </div>
              ) : (
                <div className="text-muted-foreground">Haz click o arrastra tu archivo .csv / .xlsx</div>
              )}
            </div>
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {file && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2 · Mapea las columnas</CardTitle>
            <CardDescription className="text-xs">
              Indica qué columna de tu archivo contiene cada campo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phoneCol">Teléfono (requerido)</Label>
                <Input id="phoneCol" value={phoneCol} onChange={(e) => setPhoneCol(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nameCol">Nombre</Label>
                <Input id="nameCol" value={nameCol} onChange={(e) => setNameCol(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emailCol">Email</Label>
                <Input id="emailCol" value={emailCol} onChange={(e) => setEmailCol(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customCols">Columnas custom (coma-sep)</Label>
                <Input
                  id="customCols"
                  placeholder="ciudad, plan, fecha"
                  value={customCols}
                  onChange={(e) => setCustomCols(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {file && !preview && (
        <div className="flex justify-end">
          <Button onClick={handleDryRun} disabled={loading}>
            {loading ? "Analizando…" : "Previsualizar"}
          </Button>
        </div>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3 · Revisa y confirma</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Válidos" value={preview.valid.length} icon={<CheckCircle2Icon className="size-4 text-emerald-600" />} />
              <Stat label="Inválidos" value={preview.invalid.length} icon={<XCircleIcon className="size-4 text-red-600" />} />
              <Stat label="Duplicados" value={preview.duplicateCount} />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleConfirm} disabled={loading || preview.valid.length === 0}>
                {loading ? "Importando…" : `Importar ${preview.valid.length} contactos`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {icon}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
