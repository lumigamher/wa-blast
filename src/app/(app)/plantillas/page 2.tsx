import Link from "next/link";
import { PlusIcon, ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SyncTemplatesButton } from "./_sync-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FavoriteButton } from "@/components/favorite-button";
import { WhatsAppBubble } from "@/components/whatsapp-bubble";
import {
  chatwootApi,
  type WhatsAppTemplate,
} from "@/lib/chatwoot";
import { listFavoriteKeys } from "@/lib/db";
import { env } from "@/lib/env";
import { metaApi, type MetaTemplate } from "@/lib/meta";
import { getSession } from "@/lib/session";
import { extractVariables } from "@/lib/templates";

export const dynamic = "force-dynamic";

type MergedTemplate = WhatsAppTemplate & {
  syncedInChatwoot: boolean;
  favorited: boolean;
};

function metaToChatwootShape(t: MetaTemplate): WhatsAppTemplate {
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category as WhatsAppTemplate["category"],
    components: t.components.map((c) => ({
      type: c.type,
      text: c.text,
      format: c.format,
      example: c.example,
      buttons: c.buttons,
    })),
  };
}

export default async function PlantillasPage() {
  const session = await getSession();

  const [chatwootTemplates, metaTemplates] = await Promise.all([
    chatwootApi.listTemplates(session.user!.chatwootToken).catch(() => []),
    env.META_WABA_ID && env.META_ACCESS_TOKEN
      ? metaApi.listTemplates().catch((e) => {
          console.error("meta.listTemplates falló:", e);
          return [] as MetaTemplate[];
        })
      : Promise.resolve([] as MetaTemplate[]),
  ]);

  const chatwootByKey = new Map(
    chatwootTemplates.map((t) => [`${t.name}|${t.language}`, t]),
  );
  const favoriteKeys = listFavoriteKeys(session.user!.email);

  const templates: MergedTemplate[] = metaTemplates.length
    ? metaTemplates.map((t) => ({
        ...metaToChatwootShape(t),
        syncedInChatwoot: chatwootByKey.has(`${t.name}|${t.language}`),
        favorited: favoriteKeys.has(`${t.name}|${t.language}`),
      }))
    : chatwootTemplates.map((t) => ({
        ...t,
        syncedInChatwoot: true,
        favorited: favoriteKeys.has(`${t.name}|${t.language}`),
      }));

  templates.sort((a, b) => {
    // Favoritas primero, luego APPROVED, luego por nombre
    const fa = a.favorited ? 0 : 1;
    const fb = b.favorited ? 0 : 1;
    const order = { APPROVED: 0, PENDING: 1, PAUSED: 2, REJECTED: 3 } as const;
    return (
      fa - fb ||
      (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
      a.name.localeCompare(b.name)
    );
  });

  const metaManagerUrl = env.META_WABA_ID
    ? `https://business.facebook.com/wa/manage/message-templates/?business_id=${env.META_WABA_ID}`
    : null;

  const metaCount = metaTemplates.length;
  const syncedCount = templates.filter((t) => t.syncedInChatwoot).length;
  const pendingSync = templates.filter((t) => !t.syncedInChatwoot).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas</h1>
          <p className="text-sm text-muted-foreground">
            Plantillas de WhatsApp. Meta es la fuente de verdad; Chatwoot las
            sincroniza cada ~6h para poder enviarlas.
          </p>
          {metaCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {metaCount} en Meta · {syncedCount} listas para enviar ·{" "}
              {pendingSync} pendientes de sync en Chatwoot
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncTemplatesButton />
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
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const vars = extractVariables(t);
          return (
            <Card
              key={`${t.name}-${t.language}`}
              className="flex flex-col overflow-hidden"
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
                  {!t.syncedInChatwoot && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber-400 text-[10px] text-amber-700"
                      title="Aún no ha sincronizado en Chatwoot. Hasta que sincronice (~6h) no se puede enviar desde aquí."
                    >
                      sync pending
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <WhatsAppBubble
                  template={t}
                  highlightVars
                  size="md"
                />
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
