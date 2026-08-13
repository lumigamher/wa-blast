import { displayIdentity } from "@/lib/inbox/display-identity";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { SearchIcon, TagIcon, UploadIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listTags } from "@/lib/contacts/tags";
import { ContactoPeek } from "./_contacto-peek";
import { NuevoContactoDialog } from "./_nuevo-contacto-dialog";
import { OptOutToggle } from "./_optout-toggle";
import { listContactsAction } from "./actions";

export const dynamic = "force-dynamic";

function buildHref(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const merged = { ...base, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const qs = params.toString();
  return `/contactos${qs ? `?${qs}` : ""}`;
}

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; tag?: string }>;
}) {
  await requireModuleAccess("contactos");
  const { orgId } = await requireOrg();
  const { q, status, tag } = await searchParams;
  const statusFilter = status === "activos" || status === "optout" ? status : undefined;

  const [rows, allTags] = await Promise.all([
    listContactsAction({ q, status: statusFilter, tagId: tag }),
    listTags(db, orgId),
  ]);
  const activeCount = rows.filter((r) => !r.optOutAt).length;
  const baseParams = { q, status, tag };
  const hasFilters = !!(q || statusFilter || tag);

  const statusTabs: { key: string | undefined; label: string }[] = [
    { key: undefined, label: "Todos" },
    { key: "activos", label: "Activos" },
    { key: "optout", label: "Opt-out" },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length}
            {rows.length === 500 ? "+" : ""} {hasFilters ? "en este filtro" : "en total"} ·{" "}
            {activeCount} activos · {rows.length - activeCount} opt-out
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NuevoContactoDialog />
          <Link
            href="/contactos/import"
            className={buttonVariants({ size: "sm" })}
          >
            <UploadIcon className="size-4" />
            Importar CSV / Excel
          </Link>
        </div>
      </header>

      {/* Búsqueda + filtros de segmento */}
      <div className="space-y-3">
        <form className="relative max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre, teléfono o @usuario…"
            className="pl-8"
          />
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {tag && <input type="hidden" name="tag" value={tag} />}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {/* Estado */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {statusTabs.map((s) => {
              const active = statusFilter === s.key || (!statusFilter && !s.key);
              return (
                <Link
                  key={s.label}
                  href={buildHref(baseParams, { status: s.key })}
                  className={`rounded-md px-3 py-1 text-xs transition-colors ${
                    active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>

          {/* Tags como filtros */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <TagIcon className="size-3.5 text-muted-foreground" />
              {allTags.map((t) => {
                const active = tag === t.id;
                return (
                  <Link
                    key={t.id}
                    href={buildHref(baseParams, { tag: active ? undefined : t.id })}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      active ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </Link>
                );
              })}
            </div>
          )}

          {hasFilters && (
            <Link href="/contactos" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Limpiar filtros
            </Link>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <UsersIcon className="size-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {hasFilters ? "No hay contactos con estos filtros" : "Aún no hay contactos"}
            </div>
            {!hasFilters && (
              <Link href="/contactos/import" className={buttonVariants({ size: "sm", variant: "outline" })}>
                Importar tu primera lista
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: tabla */}
          <Card className="hidden overflow-hidden py-0 md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nombre</th>
                  <th className="px-3 py-2 text-left font-medium">Teléfono</th>
                  <th className="px-3 py-2 text-left font-medium">Empresa</th>
                  <th className="px-3 py-2 text-left font-medium">Tags</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/contactos/${r.id}`} className="font-medium hover:underline">
                        {displayIdentity({ name: r.name, username: r.username, phone: r.phone, bsuid: r.bsuid })}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.company ?? "—"}</td>
                    <td className="px-3 py-2">
                      <TagChips tags={r.tagList} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                    <td className="px-3 py-2">
                      <OptOutToggle contactId={r.id} optedOut={Boolean(r.optOutAt)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ContactoPeek
                        row={{ id: r.id, phone: r.phone, name: r.name, email: r.email, company: r.company }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Móvil: cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/contactos/${r.id}`}
                className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{displayIdentity({ name: r.name, username: r.username, phone: r.phone, bsuid: r.bsuid })}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.phone ?? (r.username ? "@" + r.username.replace(/^@/, "") : "—")}</div>
                  </div>
                  {r.optOutAt ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                      opt-out
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      activo
                    </span>
                  )}
                </div>
                {(r.company || r.email) && (
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {[r.company, r.email].filter(Boolean).join(" · ")}
                  </div>
                )}
                {r.tagList.length > 0 && (
                  <div className="mt-2">
                    <TagChips tags={r.tagList} />
                  </div>
                )}
              </Link>
            ))}
          </div>

          {rows.length === 500 && (
            <p className="text-center text-xs text-muted-foreground">
              Mostrando los primeros 500 · usa la búsqueda o los filtros para acotar.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TagChips({ tags }: { tags: { id: string; name: string; color: string }[] }) {
  if (tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
          {t.name}
        </span>
      ))}
      {tags.length > 3 && <span className="text-[11px] text-muted-foreground">+{tags.length - 3}</span>}
    </div>
  );
}
