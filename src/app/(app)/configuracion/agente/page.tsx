import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { getAgentConfig } from "@/lib/agent/config";
import { getCalendarConfig } from "@/lib/agent/integrations/calendar/config";
import { getCatalogConfig } from "@/lib/agent/integrations/catalog/config";
import { listProducts } from "@/lib/agent/admin";
import { agentTools, agentRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { AgentForm } from "./_form";
import { AgentTools } from "./_tools";
import { AgentCalendar } from "./_calendar";
import { AgentCatalog } from "./_catalog";
import { AgentProducts } from "./_products";
import { AgentPayments } from "./_payments";
import { listPaymentMethods } from "@/lib/agent/payments/methods";
import { listVariants } from "@/lib/agent/catalog/variants";
import { listImages, imageUrl } from "@/lib/agent/catalog/images";

export const dynamic = "force-dynamic";

const STATUS_BADGE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10", text: "text-emerald-700 dark:text-emerald-300", label: "Éxito" },
  error: { bg: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/10", text: "text-red-700 dark:text-red-300", label: "Error" },
  capped: { bg: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10", text: "text-amber-700 dark:text-amber-300", label: "Límite alcanzado" },
  escalated: { bg: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10", text: "text-blue-700 dark:text-blue-300", label: "Escalado" },
};

export default async function AgentePage() {
  await requireModuleAccess("agente");
  const { orgId } = await requireOrg();

  const config = await getAgentConfig(db, orgId);
  const calendar = await getCalendarConfig(db, orgId);
  const catalogConfig = await getCatalogConfig(db, orgId);
  const baseProductList =
    catalogConfig?.provider === "internal" || !catalogConfig ? await listProducts(db, orgId) : [];

  // Load variants and images for each product
  const productList = await Promise.all(
    baseProductList.map(async (product) => {
      const variants = await listVariants(db, product.id);
      const imageRows = await listImages(db, product.id);
      return {
        ...product,
        variants: variants.map((v) => ({
          id: v.id,
          label: v.label,
          priceCop: v.priceCop,
          sku: v.sku,
          available: v.available,
        })),
        images: imageRows.map((r) => ({
          id: r.id,
          url: imageUrl(r),
          label: r.label,
          variantId: r.variantId,
        })),
      };
    }),
  );

  const paymentList = await listPaymentMethods(db, orgId);

  const toolRows = await db.select().from(agentTools).where(eq(agentTools.orgId, orgId));
  const enabledMap = Object.fromEntries(
    toolRows.filter((t) => t.type === "builtin").map((t) => [t.key, t.enabled]),
  );

  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.orgId, orgId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(10);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Agente IA</h1>
        <p className="text-sm text-muted-foreground">
          Configura y controla el comportamiento de tu asistente automático.
        </p>
      </header>

      <AgentForm config={config} />

      <AgentTools enabled={enabledMap} />

      <AgentCalendar
        configured={!!calendar}
        current={{
          provider: calendar?.provider ?? "calcom",
          eventTypeId: calendar?.eventTypeId ?? 0,
          durationMin: calendar?.durationMin ?? 30,
          timezone: calendar?.timezone ?? "America/Bogota",
        }}
      />

      <AgentCatalog
        provider={catalogConfig?.provider ?? "internal"}
        config={catalogConfig?.config ?? {}}
      />

      {(catalogConfig?.provider === "internal" || !catalogConfig) && (
        <AgentProducts items={productList} />
      )}

      <AgentPayments items={paymentList} />

      {/* Activity card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actividad reciente</CardTitle>
          <CardDescription className="text-xs">
            Últimas 10 ejecuciones del agente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay actividad.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">
                      Fecha
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">
                      Estado
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">
                      Costo (COP)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const badgeData = STATUS_BADGE_MAP[run.status];
                    const localDate = new Date(run.createdAt).toLocaleString("es-CO", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
                    const costFormatted = new Intl.NumberFormat("es-CO", {
                      style: "currency",
                      currency: "COP",
                      maximumFractionDigits: 0,
                    }).format(run.costCop);

                    return (
                      <tr key={run.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-2 text-xs text-muted-foreground">{localDate}</td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className={`${badgeData.bg} ${badgeData.text}`}>
                            {badgeData.label}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-right text-foreground font-mono text-xs">
                          {costFormatted}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
