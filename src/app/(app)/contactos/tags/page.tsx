import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listTags } from "@/lib/contacts/tags";
import { createTagAction, deleteTagAction } from "./actions";

export default async function TagsPage() {
  const { orgId } = await requireOrg();
  const rows = await listTags(db, orgId);

  return (
    <div className="p-6 max-w-lg space-y-6">
      <h1 className="text-xl font-semibold">Tags</h1>

      <form action={createTagAction} className="flex gap-2">
        <input name="name" required placeholder="Nombre" className="flex-1 rounded border px-3 py-2" />
        <input name="color" type="color" defaultValue="#6366f1" className="rounded border px-2" />
        <button className="rounded bg-primary text-primary-foreground px-4">Crear</button>
      </form>

      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded border p-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="flex-1">{t.name}</span>
            <form action={async () => { "use server"; await deleteTagAction(t.id); }}>
              <button className="text-xs text-red-600 underline">delete</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
