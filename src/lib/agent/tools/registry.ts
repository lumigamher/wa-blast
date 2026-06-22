import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentTools } from "@/lib/db/schema";
import { agendarCita } from "./builtin/agendar-cita";
import { buscarEnDocs } from "./builtin/buscar-en-docs";
import { buscarProducto } from "./builtin/buscar-producto";
import { calcularTotal } from "./builtin/calcular-total";
import { consultarDisponibilidad } from "./builtin/consultar-disponibilidad";
import { cotizarEnvio } from "./builtin/cotizar-envio";
import { crearPedido } from "./builtin/crear-pedido";
import { enviarCheckout } from "./builtin/enviar-checkout";
import { enviarFotoProducto } from "./builtin/enviar-foto-producto";
import { enviarQrPago } from "./builtin/enviar-qr-pago";
import { escalarHumano } from "./builtin/escalar-humano";
import { generarLinkPagoTool } from "./builtin/generar-link-pago";
import { mediosDePago } from "./builtin/medios-de-pago";
import { registrarPago } from "./builtin/registrar-pago";
import { recopilarDatos } from "./builtin/recopilar-datos";
import { httpConnectorConfigSchema, makeHttpTool } from "./http-connector";
import type { AgentTool } from "./types";

export const BUILTIN_TOOLS: Record<string, AgentTool> = {
  agendar_cita: agendarCita,
  buscar_en_docs: buscarEnDocs,
  buscar_producto: buscarProducto,
  calcular_total: calcularTotal,
  consultar_disponibilidad: consultarDisponibilidad,
  cotizar_envio: cotizarEnvio,
  crear_pedido: crearPedido,
  enviar_checkout: enviarCheckout,
  enviar_foto_producto: enviarFotoProducto,
  enviar_qr_pago: enviarQrPago,
  escalar_a_humano: escalarHumano,
  generar_link_pago: generarLinkPagoTool,
  medios_de_pago: mediosDePago,
  registrar_pago: registrarPago,
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
