import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentTools } from "@/lib/db/schema";
import { agendarCita } from "./builtin/agendar-cita";
import { calcularTotal } from "./builtin/calcular-total";
import { consultarDisponibilidad } from "./builtin/consultar-disponibilidad";
import { escalarHumano } from "./builtin/escalar-humano";
import { recopilarDatos } from "./builtin/recopilar-datos";
import { httpConnectorConfigSchema, makeHttpTool } from "./http-connector";
import type { AgentTool } from "./types";

export const BUILTIN_TOOLS: Record<string, AgentTool> = {
  agendar_cita: agendarCita,
  calcular_total: calcularTotal,
  consultar_disponibilidad: consultarDisponibilidad,
  escalar_a_humano: escalarHumano,
  recopilar_datos: recopilarDatos,
};

export async function resolveTools(db: DB, orgId: string): Promise<AgentTool[]> {
  const rows = await db
    .select()
    .from(agentTools)
    .where(and(eq(agentTools.orgId, orgId), eq(agentTools.enabled, true)));

  const tools: AgentTool[] = [];
  for (const row of rows) {
    if (row.type === "builtin") {
      const t = BUILTIN_TOOLS[row.key];
      if (t) tools.push(t);
    } else if (row.type === "http") {
      try {
        const cfg = httpConnectorConfigSchema.parse(JSON.parse(row.configJson));
        tools.push(makeHttpTool(cfg));
      } catch {
        // conector mal configurado o JSON inválido: lo omite
      }
    }
  }
  return tools;
}
