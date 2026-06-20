import { z } from "zod";
import { getCalendarConfig } from "../../integrations/calendar/config";
import { getCalendarProvider } from "../../integrations/calendar/index";
import type { AgentTool } from "../types";

const schema = z.object({
  slotISO: z.string(),
  nombre: z.string().min(1),
  email: z.string().email(),
});

export const agendarCita: AgentTool = {
  name: "agendar_cita",
  description:
    "Agenda una asesoría en el slot seleccionado. Úsalo DESPUÉS de que el cliente haya elegido un horario. Requiere: slotISO (hora ISO que el cliente eligió), nombre (cliente), email (cliente).",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      slotISO: {
        type: "string",
        description: "Hora de inicio del slot elegido en formato ISO (ej: 2026-07-01T15:00:00.000Z)",
      },
      nombre: {
        type: "string",
        description: "Nombre completo del cliente",
      },
      email: {
        type: "string",
        format: "email",
        description: "Correo electrónico del cliente",
      },
    },
    required: ["slotISO", "nombre", "email"],
  },
  async run(args, ctx) {
    const { slotISO, nombre, email } = schema.parse(args);

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

    try {
      const result = await provider.createBooking({
        startISO: slotISO,
        name: nombre,
        email,
        timezone: cfg.timezone,
      });

      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      return {
        ok: true,
        data: {
          bookingId: result.bookingId,
          startISO: result.startISO,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, error: msg };
    }
  },
};
