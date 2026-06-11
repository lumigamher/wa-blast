import Link from "next/link";
import { ArrowLeftIcon, MessageSquareIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listQuickReplies } from "@/lib/inbox/quick-replies";
import { QuickRepliesForm } from "./_form";
import { QuickReplyItem } from "./_item";

export const dynamic = "force-dynamic";

export default async function QuickRepliesPage() {
  const { orgId } = await requireOrg();
  const quickReplies = await listQuickReplies(db, orgId);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Respuestas rápidas</h1>
        <p className="text-sm text-muted-foreground">
          Crea plantillas de respuestas que puedas insertar rápidamente al escribir mensajes. Usa <code className="rounded bg-muted px-1 text-foreground">/</code> en el compositor.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tus respuestas</CardTitle>
              <CardDescription className="text-xs">
                {quickReplies.length === 0
                  ? "Crea tu primera respuesta rápida"
                  : `${quickReplies.length} respuesta${quickReplies.length !== 1 ? "s" : ""}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quickReplies.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <MessageSquareIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Ninguna respuesta rápida aún</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {quickReplies.map((reply) => (
                    <QuickReplyItem key={reply.id} reply={reply} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nueva respuesta</CardTitle>
              <CardDescription className="text-xs">Crea una respuesta rápida</CardDescription>
            </CardHeader>
            <CardContent>
              <QuickRepliesForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
