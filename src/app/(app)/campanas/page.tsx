import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { campaigns } from "@/lib/db/schema";

export default async function CampanasPage() {
  const { orgId } = await requireOrg();
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(desc(campaigns.createdAt))
    .limit(100);
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">Campañas</h1>
        <Link href="/campanas/nueva" className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm">
          Nueva
        </Link>
      </div>
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="rounded border p-3 flex items-center gap-3">
            <div className="flex-1">
              <Link href={`/campanas/${c.id}`} className="font-medium hover:underline">
                {c.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {c.templateName} · {c.status}
              </div>
            </div>
            <div className="text-sm">
              {c.sent}/{c.total}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
