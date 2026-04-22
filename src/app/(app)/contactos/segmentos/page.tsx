import Link from "next/link";
import { listSegmentsAction } from "./actions";

export default async function SegmentsListPage() {
  const rows = await listSegmentsAction();
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">Segmentos</h1>
        <Link href="/contactos/segmentos/nuevo" className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm">
          Nuevo segmento
        </Link>
      </div>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id} className="rounded border p-3">
            <div className="font-medium">{s.name}</div>
            <div className="text-xs font-mono text-muted-foreground truncate">{s.ruleJson}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
