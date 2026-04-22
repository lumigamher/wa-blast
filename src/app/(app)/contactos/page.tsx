import Link from "next/link";
import { SearchIcon, UploadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listContactsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await listContactsAction(q);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "contacto" : "contactos"} en tu lista
          </p>
        </div>
        <Link href="/contactos/import" className={buttonVariants({ size: "sm" })}>
          <UploadIcon className="size-4" />
          Importar CSV / Excel
        </Link>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <form className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre o teléfono…" className="pl-8" />
            </div>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border-t py-16 text-center">
              <div className="text-sm text-muted-foreground">
                {q ? `No hay contactos que coincidan con "${q}"` : "Aún no hay contactos"}
              </div>
              {!q && (
                <Link href="/contactos/import" className={buttonVariants({ size: "sm", variant: "outline" })}>
                  Importar tu primera lista
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-hidden border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Nombre</th>
                    <th className="text-left px-3 py-2 font-medium">Teléfono</th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2">{r.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.optOutAt ? (
                          <Badge variant="destructive">opt-out</Badge>
                        ) : (
                          <Badge variant="outline">activo</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
