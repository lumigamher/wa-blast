"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSegmentAction, previewSegmentAction } from "../actions";

const DEFAULT_RULE = JSON.stringify(
  {
    combinator: "AND",
    conditions: [{ field: "tag", op: "in", value: ["vip"] }],
  },
  null,
  2,
);

export default function NewSegmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rule, setRule] = useState(DEFAULT_RULE);
  const [preview, setPreview] = useState<{ count: number; first: unknown[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function doPreview() {
    setErr(null);
    try {
      const res = await previewSegmentAction(rule);
      setPreview(res);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function save() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("ruleJson", rule);
    await createSegmentAction(fd);
    router.push("/contactos/segmentos");
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Nuevo segmento</h1>

      <label className="block">
        <span className="text-sm">Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded border px-3 py-2" />
      </label>

      <label className="block">
        <span className="text-sm">Regla (JSON)</span>
        <textarea
          rows={14}
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          className="mt-1 block w-full font-mono text-sm rounded border px-3 py-2"
        />
      </label>

      <div className="flex gap-2">
        <button onClick={doPreview} className="rounded border px-3 py-2">
          Preview
        </button>
        <button onClick={save} disabled={!name} className="rounded bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50">
          Guardar
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {preview && (
        <div className="rounded border p-3 text-sm">
          <p>
            Coincidencias: <b>{preview.count}</b>
          </p>
        </div>
      )}
    </div>
  );
}
