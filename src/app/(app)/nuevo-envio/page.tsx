import { redirect } from "next/navigation";
import { chatwootApi } from "@/lib/chatwoot";
import { listFavoriteKeys } from "@/lib/db";
import { getSession } from "@/lib/session";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function NuevoEnvioPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");

  const all = await chatwootApi.listTemplates(session.user.chatwootToken);
  const usable = all.filter(
    (t) => t.status === "APPROVED" || t.status === "PENDING",
  );
  const favorites = [...listFavoriteKeys(session.user.email)];

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo envío</h1>
        <p className="text-sm text-muted-foreground">
          Escoge una plantilla, elige destinatarios y revisa antes de enviar.
        </p>
      </header>
      {usable.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No hay plantillas sincronizadas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sincroniza las plantillas en Chatwoot → Inbox FUNES → Sync
            Templates.
          </p>
        </div>
      ) : (
        <Wizard templates={usable} initialFavorites={favorites} />
      )}
    </div>
  );
}
