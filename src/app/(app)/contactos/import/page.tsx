"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Importar contactos</h1>

      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPreview(null);
        }}
      />

      {file && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Columna de teléfono" value={phoneCol} onChange={setPhoneCol} />
          <Field label="Columna de nombre" value={nameCol} onChange={setNameCol} />
          <Field label="Columna de email" value={emailCol} onChange={setEmailCol} />
          <Field label="Columnas custom (coma-sep)" value={customCols} onChange={setCustomCols} />
        </div>
      )}

      {file && !preview && (
        <button
          onClick={handleDryRun}
          disabled={loading}
          className="rounded bg-primary text-primary-foreground px-4 py-2"
        >
          {loading ? "Analizando…" : "Previsualizar"}
        </button>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="rounded border p-3 text-sm">
            <p>
              Válidos: <b>{preview.valid.length}</b>
            </p>
            <p>
              Inválidos: <b>{preview.invalid.length}</b>
            </p>
            <p>
              Duplicados internos: <b>{preview.duplicateCount}</b>
            </p>
          </div>
          <button
            onClick={handleConfirm}
            disabled={loading || preview.valid.length === 0}
            className="rounded bg-primary text-primary-foreground px-4 py-2"
          >
            {loading ? "Importando…" : `Importar ${preview.valid.length}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border px-3 py-2"
      />
    </label>
  );
}
