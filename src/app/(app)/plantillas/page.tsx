import { requireModuleAccess } from "@/lib/billing/require-module";
import { and, eq } from "drizzle-orm";
import { ExternalLinkIcon, PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { templateFavorites } from "@/lib/db/schema";
import { credsFromSettings, listTemplates } from "@/lib/meta/graph";
import type { WhatsAppTemplate } from "@/lib/meta/types";
import { getOrgSettings } from "@/lib/org/settings";
import { extractVariables } from "@/lib/templates";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "PENDING", label: "Pendientes" },
  { key: "REJECTED", label: "Rechazadas" },
  { key: "PAUSED", label: "Pausadas" },
] as const;

type Merged = WhatsAppTemplate & { favorited: boolean };

export default async function PlantillasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireModuleAccess("plantillas");
  const { q, status } = await searchParams;
  const { orgId, session } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);

  const templates = creds
    ? await listTemplates(creds, { fresh: true }).catch((e) => {
        console.error("meta.listTemplates falló:", e);
        return [];
      })
    : [];

  const favs = await db
    .select()
    .from(templateFavorites)
    .where(
      and(
        eq(templateFavorites.orgId, orgId),
        eq(templateFavorites.userId, session.user.id),
      ),
    );
  const favKeys = new Set(
    favs.map((f) => `${f.templateName}|${f.templateLanguage}`),
  );

  const counts: Record<string, number> = { all: templates.length };
  for (const t of templates) counts[t.status] = (counts[t.status] ?? 0) + 1;

  const filtered: Merged[] = templates
    .filter((t) => (status && status !== "all" ? t.status === status : true))
    .filter((t) => (q ? t.name.toLowerCase().includes(q.toLowerCase()) : true))
    .map((t) => ({ ...t, favorited: favKeys.has(`${t.name}|${t.language}`) }))
    .sort((a, b) => {
      const fa = a.favorited ? 0 : 1;
      const fb = b.favorited ? 0 : 1;
      const order = {
        APPROVED: 0,
        PENDING: 1,
        PAUSED: 2,
        REJECTED: 3,
      } as const;
      return (
        fa - fb ||
        (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
        a.name.localeCompare(b.name)
      );
    });

  const metaManagerUrl = settings.metaWabaId
    ? `https://business.facebook.com/wa/manage/message-templates/?business_id=${settings.metaWabaId}`
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas</h1>
          <p className="text-sm text-muted-foreground">
            Plantillas de WhatsApp · Meta es la fuente de verdad.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {metaManagerUrl && (
            <a
              href={metaManagerUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLinkIcon className="size-3.5" />
              Ver en Meta
            </a>
          )}
          <Link
            href="/plantillas/nueva"
            className={buttonVariants({ size: "sm" })}
          >
            <PlusIcon className="size-4" />
            Nueva plantilla
          </Link>
        </div>
      </header>

      {!creds && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-6 text-sm">
            <span className="text-amber-700">
              Configura tus credenciales de Meta para ver tus plantillas.
            </span>
            <Link
              href="/configuracion/meta"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ir a Configuración
            </Link>
          </CardContent>
        </Card>
      )}

      {creds && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 py-3">
              <form className="relative max-w-sm flex-1">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder="Buscar plantilla…"
                  className="pl-8"
                />
                {status && status !== "all" && (
                  <input type="hidden" name="status" value={status} />
                )}
              </form>
              <div className="flex flex-wrap gap-1">
                {STATUS_FILTERS.map((f) => {
                  const isActive = (status ?? "all") === f.key;
                  const qs = new URLSearchParams();
                  if (f.key !== "all") qs.set("status", f.key);
                  if (q) qs.set("q", q);
                  const count = counts[f.key] ?? 0;
                  return (
                    <Link
                      key={f.key}
                      href={`/plantillas${qs.toString() ? `?${qs}` : ""}`}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {f.label}
                      {count > 0 && (
                        <span className="ml-1 opacity-70">({count})</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No hay plantillas que coincidan con tu filtro.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => {
                const vars = extractVariables(t);
                return (
                  <Card
                    key={`${t.name}-${t.language}`}
                    className="flex flex-col overflow-hidden hover:shadow-md"
                  >
                    <CardHeader className="relative gap-2 pb-3">
                      <div className="absolute right-4 top-4 z-10">
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="flex min-w-0 items-center gap-1 pr-24">
                        <FavoriteButton
                          name={t.name}
                          language={t.language}
                          favorited={t.favorited}
                          size="sm"
                        />
                        <CardTitle
                          className="relative block min-w-0 overflow-hidden whitespace-nowrap font-mono text-sm [mask-image:linear-gradient(to_right,black_85%,transparent_100%)]"
                          title={t.name}
                        >
                          {t.name}
                        </CardTitle>
                      </div>
                      <CardDescription className="flex items-center gap-2 pr-24 text-xs">
                        <span className="truncate">
                          {t.category} · {t.language}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-3">
                      <WhatsAppBubble template={t} highlightVars size="md" />
                      {vars.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                          {vars.map((v) => (
                            <code
                              key={v.index}
                              className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-900"
                              title={v.example || v.placeholder}
                            >
                              {v.placeholder}
                            </code>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground">
                          Sin variables
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "APPROVED"
      ? "default"
      : status === "PENDING"
        ? "secondary"
        : "destructive";
  return (
    <Badge variant={variant} className="shrink-0 whitespace-nowrap">
      {status}
    </Badge>
  );
}
