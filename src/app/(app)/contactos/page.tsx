import Link from "next/link";
import { SearchIcon, UploadIcon, UsersIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listContactsAction } from "./actions";
import { OptOutToggle } from "./_optout-toggle";
import { NuevoContactoDialog } from "./_nuevo-contacto-dialog";
import { ContactoPeek } from "./_contacto-peek";

export const dynamic = "force-dynamic";

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await listContactsAction(q);
  const activeCount = rows.filter((r) => !r.optOutAt).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} en total · {activeCount} activos · {rows.length - activeCount} opt-out
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NuevoContactoDialog />
          <Link href="/contactos/import" className={buttonVariants({ size: "sm" })}>
            <UploadIcon className="size-4" />
            Importar CSV / Excel
          </Link>
        </div>
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
              <UsersIcon className="size-8 text-muted-foreground" />
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
                    <th className="text-left px-3 py-2 font-medium">Empresa</th>
                    <th className="text-left px-3 py-2 font-medium">Tags</th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t transition-colors hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/contactos/${r.id}`} className="font-medium hover:underline">
                          {r.name ?? r.phone}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.company ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.tagList.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.tagList.slice(0, 3).map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                              >
                                <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                                {t.name}
                              </span>
                            ))}
                            {r.tagList.length > 3 && (
                              <span className="text-[11px] text-muted-foreground">+{r.tagList.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                      <td className="px-3 py-2">
                        <OptOutToggle contactId={r.id} optedOut={Boolean(r.optOutAt)} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ContactoPeek row={{ id: r.id, phone: r.phone, name: r.name, email: r.email, company: r.company }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 500 && (
                <div className="border-t bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                  Mostrando los primeros 500 resultados · refina la búsqueda para ver más.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
