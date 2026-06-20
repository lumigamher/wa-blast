import { z } from "zod";
import { getCalendarConfig } from "../../integrations/calendar/config";
import { getCalendarProvider } from "../../integrations/calendar/index";
import type { AgentTool } from "../types";

const schema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dias: z.number().positive().optional(),
});

export const consultarDisponibilidad: AgentTool = {
  name: "consultar_disponibilidad",
  description:
    "Consulta los horarios disponibles para agendar una asesoría. Úsalo SIEMPRE antes de agendar para mostrar las opciones al cliente. Parámetros: fecha (YYYY-MM-DD, opcional, hoy si no se da) y dias (cuántos días adelante buscar, default 7).",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      fecha: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Fecha inicial en formato YYYY-MM-DD. Si no se proporciona, se usa hoy.",
      },
      dias: {
        type: "number",
        description: "Cantidad de días a consultar hacia adelante. Por defecto 7.",
      },
    },
  },
  async run(args, ctx) {
    const { fecha, dias } = schema.parse(args);

    const cfg = await getCalendarConfig(ctx.db, ctx.orgId);
    if (!cfg) {
      return { ok: false, error: "Calendario no configurado" };
    }

    const provider = getCalendarProvider({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      eventTypeId: cfg.eventTypeId,
      durationMin: cfg.durationMin,
    });

    // Compute fromISO: start of fecha or today
    const fromDate = fecha ? new Date(`${fecha}T00:00:00Z`) : new Date();
    fromDate.setUTCHours(0, 0, 0, 0);
    const fromISO = fromDate.toISOString();

    // Compute toISO: fromISO + (dias ?? 7) days
    const daysToAdd = dias ?? 7;
    const toDate = new Date(fromDate);
    toDate.setUTCDate(toDate.getUTCDate() + daysToAdd);
    const toISO = toDate.toISOString();

    try {
      const slots = await provider.getSlots({
        fromISO,
        toISO,
        timezone: cfg.timezone,
      });

      // Return first 10 slots
      return {
        ok: true,
        data: {
          slots: slots.slice(0, 10),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, error: msg };
    }
  },
};
