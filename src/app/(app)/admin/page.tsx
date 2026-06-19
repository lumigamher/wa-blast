import { sql } from "drizzle-orm";
import { Ban, CheckCircle2, Circle, ShieldIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/admin";
import { getPlanCatalog } from "@/lib/billing/config";
import { getSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db/client";
import { member, organization, subscriptions } from "@/lib/db/schema";
import { OrgActions } from "./_components/org-actions";
import { PriceEditor } from "./_components/price-editor";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();

  // Query orgs with member counts and subscription status
  const orgs = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      memberCount: sql<number>`COUNT(DISTINCT ${member.id})`,
      subStatus: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
    })
    .from(organization)
    .leftJoin(member, sql`${organization.id} = ${member.organizationId}`)
    .leftJoin(subscriptions, sql`${organization.id} = ${subscriptions.orgId}`)
    .groupBy(organization.id)
    .orderBy(sql`${organization.createdAt} DESC`);

  // Get plan catalog with prices
  const catalog = await getPlanCatalog(db);

  // Transform subscription data to include full status
  const orgsWithStatus = await Promise.all(
    orgs.map(async (org) => {
      const sub = await getSubscription(db, org.id);
      return {
        ...org,
        subStatus: sub.status,
        paidUntil: sub.paidUntil,
        planId: sub.planId,
      };
    }),
  );

  const getStatusBadge = (
    status: "none" | "active" | "expired" | "suspended",
    paidUntil: Date | null,
  ) => {
    switch (status) {
      case "suspended":
        return { Icon: Ban, label: "Suspendida", color: "text-red-600" };
      case "active":
        return {
          Icon: CheckCircle2,
          label: `Activa (hasta ${paidUntil?.toLocaleDateString("es-CO")})`,
          color: "text-green-600",
        };
      case "expired":
        return {
          Icon: Circle,
          label: `Vencida ${paidUntil?.toLocaleDateString("es-CO")}`,
          color: "text-yellow-600",
        };
      case "none":
      default:
        return {
          Icon: Circle,
          label: "Sin suscripción",
          color: "text-gray-600",
        };
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <ShieldIcon className="size-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel Admin</h1>
          <p className="text-sm text-muted-foreground">
            {orgsWithStatus.length} organizaciones
          </p>
        </div>
      </header>

      {/* Precios de los planes */}
      <PriceEditor catalog={catalog} />

      {/* Tabla de organizaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organizaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium">
                    Organización
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium">Miembros</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Suscripción
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orgsWithStatus.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="border-t py-12 text-center text-muted-foreground"
                    >
                      No hay organizaciones
                    </td>
                  </tr>
                ) : (
                  orgsWithStatus.map((org) => {
                    const badge = getStatusBadge(org.subStatus, org.paidUntil);
                    return (
                      <tr key={org.id} className="border-b">
                        <td className="px-4 py-3">
                          <div className="font-medium">{org.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {org.slug}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {org.createdAt.toLocaleDateString("es-CO")}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {org.memberCount}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`${badge.color} font-medium flex items-center gap-2`}
                          >
                            <badge.Icon className="size-4" />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <OrgActions
                            orgId={org.id}
                            subStatus={org.subStatus}
                            planId={org.planId}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
