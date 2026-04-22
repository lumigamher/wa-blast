import Link from "next/link";
import { listContactsAction } from "./actions";

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await listContactsAction(q);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">Contactos ({rows.length})</h1>
        <Link href="/contactos/import" className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm">
          Importar CSV
        </Link>
      </div>

      <form>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre o teléfono…"
          className="w-full max-w-sm rounded border px-3 py-2"
        />
      </form>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Teléfono</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Opt-out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.name ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{r.phone}</td>
                <td className="px-3 py-2">{r.email ?? "—"}</td>
                <td className="px-3 py-2">{r.optOutAt ? "sí" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
