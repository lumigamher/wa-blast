import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { tags, contactTags, templateCardMedia, templateFavorites } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings, listTemplates } from "@/lib/meta/graph";
import { publicMediaUrl } from "@/lib/media/store";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function NuevaCampanaPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: initialTemplateKey } = await searchParams;
  const { orgId, session } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);

  if (!creds) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo envío</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Configura tus credenciales de Meta en{" "}
          <Link href="/configuracion/meta" className="underline">
            Configuración → Meta WhatsApp
          </Link>{" "}
          para ver tus plantillas aprobadas.
        </div>
      </div>
    );
  }

  const [templates, tagRows, cardMediaRows, favs] = await Promise.all([
    listTemplates(creds).catch(() => []),
    db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        count: sql<number>`COUNT(${contactTags.contactId})`,
      })
      .from(tags)
      .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
      .where(eq(tags.orgId, orgId))
      .groupBy(tags.id),
    db
      .select({
        name: templateCardMedia.templateName,
        lang: templateCardMedia.templateLanguage,
        idx: templateCardMedia.cardIndex,
        assetId: templateCardMedia.assetId,
      })
      .from(templateCardMedia)
      .where(eq(templateCardMedia.orgId, orgId)),
    db
      .select({
        templateName: templateFavorites.templateName,
        templateLanguage: templateFavorites.templateLanguage,
      })
      .from(templateFavorites)
      .where(
        and(
          eq(templateFavorites.orgId, orgId),
          eq(templateFavorites.userId, session.user.id),
        ),
      ),
  ]);

  // Build prefill media map keyed by "<name>|<language>"
  const prefillMedia: Record<string, Record<number, string>> = {};
  for (const r of cardMediaRows) {
    const k = `${r.name}|${r.lang}`;
    (prefillMedia[k] ??= {})[r.idx] = publicMediaUrl(r.assetId);
  }

  // Build initialFavorites array keyed by "<name>|<language>"
  const initialFavorites = favs.map((f) => `${f.templateName}|${f.templateLanguage}`);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo envío</h1>
        <p className="text-sm text-muted-foreground">
          Elige una plantilla aprobada, escoge destinatarios, revisa y envía (o programa para después).
        </p>
      </header>
      <Wizard
        templates={templates}
        tags={tagRows.map((t) => ({ id: t.id, name: t.name, color: t.color, count: Number(t.count) }))}
        prefillMedia={prefillMedia}
        initialTemplateKey={initialTemplateKey}
        initialFavorites={initialFavorites}
      />
    </div>
  );
}
