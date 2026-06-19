import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { db } from "@/lib/db/client";
import { listFlowResponses } from "@/lib/flows/responses";

export const dynamic = "force-dynamic";

function parseFields(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export default async function FlowResponsesPage() {
  await requireModuleAccess("flows");
  const { orgId } = await requireOrg();
  const rows = await listFlowResponses(db, orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/flows">
            <Button variant="ghost" size="sm">
              <ArrowLeftIcon className="size-3.5" />
              Flows
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Respuestas de formularios
            </h1>
            <p className="text-sm text-muted-foreground">
              {rows.length} respuesta{rows.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <a href="/api/flows/responses/export">
            <Button size="sm" variant="outline">
              <DownloadIcon className="size-3.5" />
              Exportar CSV
            </Button>
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no hay respuestas. Cuando un contacto complete un formulario de
            Flow, aparecerá aquí.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const fields = parseFields(r.fieldsJson);
            const entries = Object.entries(fields);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {r.contactName ?? r.phone}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.phone}
                      {r.flowName ? ` · ${r.flowName}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {r.createdAt.toLocaleString("es-CO")}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {entries.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      (sin campos)
                    </span>
                  ) : (
                    entries.map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-sm">
                        <dt className="text-muted-foreground">{k}:</dt>
                        <dd className="min-w-0 break-words font-medium">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </dd>
                      </div>
                    ))
                  )}
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
