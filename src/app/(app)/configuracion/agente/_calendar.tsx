"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveCalendarAction } from "./actions";

export function AgentCalendar({
  configured,
  current,
}: {
  configured: boolean;
  current: {
    provider: "calcom" | "calendly" | "google";
    eventTypeId: number;
    durationMin: number;
    timezone: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState({
    provider: current.provider,
    apiKey: "",
    eventTypeId: current.eventTypeId,
    durationMin: current.durationMin,
    timezone: current.timezone,
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = await saveCalendarAction({
          provider: values.provider as "calcom" | "calendly" | "google",
          apiKey: values.apiKey,
          eventTypeId: values.eventTypeId,
          durationMin: values.durationMin,
          timezone: values.timezone,
        });
        if ("error" in result) {
          toast.error(result.error);
        } else {
          toast.success("Calendario guardado");
          router.refresh();
          setValues({ ...values, apiKey: "" });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calendario (agendamiento)</CardTitle>
        <CardDescription className="text-xs">
          Integra tu calendario para permitir que el agente agende citas automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Provider select */}
          <div className="space-y-1.5">
            <Label htmlFor="provider">Proveedor de calendario</Label>
            <Select
              value={values.provider}
              onValueChange={(v) => {
                if (v === "calcom" || v === "calendly" || v === "google") {
                  setValues({ ...values, provider: v });
                }
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calcom">Cal.com</SelectItem>
                <SelectItem value="calendly" disabled>
                  Calendly (próximamente)
                </SelectItem>
                <SelectItem value="google" disabled>
                  Google (próximamente)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API key */}
          <div className="space-y-1.5">
            <Label htmlFor="apiKey">API key</Label>
            <Input
              id="apiKey"
              type="password"
              value={values.apiKey}
              onChange={(e) => setValues({ ...values, apiKey: e.target.value })}
              placeholder={configured ? "•••• (déjalo vacío para no cambiarla)" : "Ingresa tu API key de Cal.com"}
            />
            {configured && (
              <p className="text-xs text-muted-foreground">
                Calendario configurado. Déjalo vacío para mantener la configuración existente.
              </p>
            )}
          </div>

          {/* Event type ID */}
          <div className="space-y-1.5">
            <Label htmlFor="eventTypeId">Event Type ID</Label>
            <Input
              id="eventTypeId"
              type="number"
              value={values.eventTypeId}
              onChange={(e) => setValues({ ...values, eventTypeId: Number(e.target.value) })}
              placeholder="Ej: 456"
              min="1"
            />
            <p className="text-xs text-muted-foreground">
              El ID del tipo de evento en Cal.com.
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label htmlFor="durationMin">Duración de la cita (minutos)</Label>
            <Input
              id="durationMin"
              type="number"
              value={values.durationMin}
              onChange={(e) => setValues({ ...values, durationMin: Number(e.target.value) })}
              placeholder="30"
              min="1"
            />
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Zona horaria</Label>
            <Input
              id="timezone"
              value={values.timezone}
              onChange={(e) => setValues({ ...values, timezone: e.target.value })}
              placeholder="America/Bogota"
            />
            <p className="text-xs text-muted-foreground">
              Ej: America/Bogota, America/New_York, Europe/London
            </p>
          </div>

          {/* Helper note */}
          <div className="rounded-md bg-muted/50 border border-muted p-3">
            <p className="text-xs text-muted-foreground">
              Activa también las herramientas &quot;Consultar disponibilidad&quot; y &quot;Agendar cita&quot; arriba para que el agente las use.
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
