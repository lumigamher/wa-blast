import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { campaigns } from "@/lib/db/schema";

export default async function Dashboard() {
  const { orgId } = await requireOrg();
  const recent = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(desc(campaigns.createdAt))
    .limit(5);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4">
        <Link href="/campanas/nueva" className="rounded border p-4 hover:bg-muted">
          <div className="text-lg font-semibold">Nueva campaña</div>
          <div className="text-sm text-muted-foreground">Crear y disparar un blast.</div>
        </Link>
        <Link href="/contactos/import" className="rounded border p-4 hover:bg-muted">
          <div className="text-lg font-semibold">Importar contactos</div>
          <div className="text-sm text-muted-foreground">CSV o Excel.</div>
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Campañas recientes</h2>
        <ul className="space-y-2">
          {recent.map((c) => (
            <li key={c.id} className="rounded border p-3 flex items-center gap-3">
              <Link href={`/campanas/${c.id}`} className="flex-1 font-medium hover:underline">
                {c.name}
              </Link>
              <span className="text-sm">
                {c.sent}/{c.total}
              </span>
              <span className="text-xs rounded bg-muted px-2 py-1">{c.status}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="text-sm text-muted-foreground">Aún no hay campañas.</li>}
        </ul>
      </section>
    </div>
  );
}
