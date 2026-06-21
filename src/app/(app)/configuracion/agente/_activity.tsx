import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Run = { id: string; status: string; costCop: number; createdAt: Date };

const STATUS_BADGE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10", text: "text-emerald-700 dark:text-emerald-300", label: "Éxito" },
  error: { bg: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/10", text: "text-red-700 dark:text-red-300", label: "Error" },
  capped: { bg: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10", text: "text-amber-700 dark:text-amber-300", label: "Límite alcanzado" },
  escalated: { bg: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10", text: "text-blue-700 dark:text-blue-300", label: "Escalado" },
};

export function AgentActivity({ runs }: { runs: Run[] }) {
  return (
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
  );
}
