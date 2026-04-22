import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listTags } from "@/lib/contacts/tags";
import { createTagAction, deleteTagAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const { orgId } = await requireOrg();
  const rows = await listTags(db, orgId);

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
          <form action={createTagAction} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="tag-name">Nombre</Label>
              <Input id="tag-name" name="name" required placeholder="Ej. VIP, leads-abril, clientes" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tag-color">Color</Label>
              <input
                id="tag-color"
                name="color"
                type="color"
                defaultValue="#6366f1"
                className="h-9 w-14 rounded border bg-background"
              />
            </div>
            <Button type="submit">Crear</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus tags</CardTitle>
          <CardDescription className="text-xs">{rows.length} en total</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="border-t p-8 text-center text-sm text-muted-foreground">
              Aún no tienes tags. Crea la primera arriba.
            </div>
          ) : (
            <ul className="divide-y border-t">
              {rows.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="inline-block size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="flex-1 text-sm font-medium">{t.name}</span>
                  <form
                    action={async () => {
                      "use server";
                      await deleteTagAction(t.id);
                    }}
                  >
                    <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-red-600">
                      <Trash2Icon className="size-4" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
