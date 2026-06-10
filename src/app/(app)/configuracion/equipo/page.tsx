import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { invitation, member, organization, user } from "@/lib/db/schema";
import { InviteForm, InvitationRow } from "./_team";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const { session, orgId } = await requireOrg();

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));

  const members = await db
    .select({
      id: member.id,
      role: member.role,
      userId: member.userId,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId));

  const pending = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending")));

  const myRole = members.find((m) => m.userId === session.user.id)?.role ?? "member";
  const canManage = myRole === "owner" || myRole === "admin";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
        <p className="text-sm text-muted-foreground">
          Miembros de {org?.name ?? "tu organización"} e invitaciones pendientes.
        </p>
      </header>

      {canManage && <InviteForm />}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Miembros ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y border-t">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(m.name ?? m.email).trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name ?? m.email}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                <Badge variant={m.role === "owner" ? "default" : "outline"}>{m.role}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Invitaciones pendientes ({pending.length})</CardTitle>
            <CardDescription className="text-xs">
              Recibirán un correo con el enlace para unirse.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {pending.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  id={inv.id}
                  email={inv.email}
                  role={inv.role ?? "member"}
                  expiresAt={inv.expiresAt.toISOString()}
                  canManage={canManage}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
