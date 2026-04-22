import Link from "next/link";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoriteButton } from "@/components/favorite-button";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { templateFavorites } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings, listTemplates } from "@/lib/meta/graph";
import { extractVariables } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const { orgId, session } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);

  const templates = creds
    ? await listTemplates(creds).catch((e) => {
        console.error("meta.listTemplates falló:", e);
        return [];
      })
    : [];

  const favs = await db
    .select()
    .from(templateFavorites)
    .where(and(eq(templateFavorites.orgId, orgId), eq(templateFavorites.userId, session.user.id)));
  const favKeys = new Set(favs.map((f) => `${f.templateName}|${f.templateLanguage}`));

  const sorted = templates
    .map((t) => ({ ...t, favorited: favKeys.has(`${t.name}|${t.language}`) }))
    .sort((a, b) => {
      const fa = a.favorited ? 0 : 1;
      const fb = b.favorited ? 0 : 1;
      const order = { APPROVED: 0, PENDING: 1, PAUSED: 2, REJECTED: 3 } as const;
      return fa - fb || (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name);
    });

  const metaManagerUrl = settings.metaWabaId
    ? `https://business.facebook.com/wa/manage/message-templates/?business_id=${settings.metaWabaId}`
    : null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas</h1>
          <p className="text-sm text-muted-foreground">
            Plantillas de WhatsApp · Meta es la fuente de verdad.
          </p>
          {!creds && (
            <p className="text-xs text-amber-600">
              Configura tus credenciales de Meta en{" "}
              <Link href="/configuracion/meta" className="underline">
                Configuración
              </Link>{" "}
              para ver tus plantillas.
            </p>
          )}
          {creds && (
            <p className="text-xs text-muted-foreground">{sorted.length} plantillas encontradas</p>
          )}
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
          <Link href="/plantillas/nueva" className={buttonVariants({ size: "sm" })}>
            <PlusIcon className="size-4" />
            Nueva plantilla
          </Link>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((t) => {
          const vars = extractVariables(t);
          return (
            <Card key={`${t.name}-${t.language}`} className="flex flex-col overflow-hidden">
              <CardHeader className="relative gap-2 pb-3">
                <div className="absolute right-4 top-4 z-10">
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex min-w-0 items-center gap-1 pr-24">
                  <FavoriteButton name={t.name} language={t.language} favorited={t.favorited} size="sm" />
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
                  <div className="text-[11px] text-muted-foreground">Sin variables</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "APPROVED" ? "default" : status === "PENDING" ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="shrink-0 whitespace-nowrap">
      {status}
    </Badge>
  );
}
