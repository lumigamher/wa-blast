import { eq, sql } from "drizzle-orm";
import { Trash2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { contactTags, tags } from "@/lib/db/schema";
import { createTagAction, deleteTagAction } from "./actions";

export const dynamic = "force-dynamic";

const PRESET_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#64748b"];

export default async function TagsPage() {
  const { orgId } = await requireOrg();
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      count: sql<number>`COUNT(${contactTags.contactId})`,
    })
    .from(tags)
    .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
    .where(eq(tags.orgId, orgId))
    .groupBy(tags.id)
    .orderBy(sql`COUNT(${contactTags.contactId}) DESC`);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Agrupa contactos con etiquetas para seleccionarlos fácil al crear campañas.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crear tag</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTagAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tag-name">Nombre</Label>
              <Input id="tag-name" name="name" required placeholder="Ej. VIP, leads-abril, clientes" />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <ColorPicker presets={PRESET_COLORS} />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Crear tag</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus tags</CardTitle>
          <CardDescription className="text-xs">
            {rows.length} en total · {rows.reduce((s, r) => s + Number(r.count), 0)} asignaciones
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="border-t p-10 text-center">
              <UsersIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aún no tienes tags. Crea la primera arriba.</p>
            </div>
          ) : (
            <ul className="divide-y border-t">
              {rows.map((t) => {
                const count = Number(t.count);
                return (
                  <li
                    key={t.id}
                    className="group/row flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <span
                      className="inline-block size-3 shrink-0 rounded-full ring-1 ring-black/5"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="flex-1 text-sm font-medium">{t.name}</span>
                    <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <UsersIcon className="size-3" />
                      {count}
                    </span>
                    <form
                      action={async () => {
                        "use server";
                        await deleteTagAction(t.id);
                      }}
                    >
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover/row:opacity-100"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ColorPicker({ presets }: { presets: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((c, i) => (
        <label key={c} className="cursor-pointer">
          <input
            type="radio"
            name="color"
            value={c}
            defaultChecked={i === 0}
            className="peer sr-only"
          />
          <span
            className="block size-7 rounded-full ring-1 ring-black/10 transition-all peer-checked:scale-110 peer-checked:ring-2 peer-checked:ring-offset-2 peer-checked:ring-foreground/40"
            style={{ backgroundColor: c }}
          />
        </label>
      ))}
    </div>
  );
}
