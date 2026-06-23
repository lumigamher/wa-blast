"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import type { AgentConfig } from "@/lib/agent/config";
import { CURATED_MODELS } from "@/lib/agent/providers";
import { saveAgentConfigAction } from "./actions";

const PRESETS: Record<string, string> = {
  atencion: "Eres un asistente de atención al cliente. Responde dudas frecuentes con amabilidad y precisión. Si no sabes algo, escala a un humano.",
  ventas: "Eres un asesor comercial. Entiende qué busca el cliente, recomienda productos, calcula totales con la herramienta y cierra la venta o agenda. Escala si piden algo fuera de tu alcance.",
  reservas: "Eres un recepcionista. Toma los datos del cliente (nombre, fecha, personas) con la herramienta de recopilar datos y confirma la reserva. Escala casos especiales.",
};

export function AgentForm({ config }: { config: AgentConfig }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const initialModelIsCurated = CURATED_MODELS[
    (config.provider as "openai" | "anthropic") ?? "openai"
  ].some((m) => m.id === config.model);
  const [customModel, setCustomModel] = useState(!initialModelIsCurated);
  const [values, setValues] = useState({
    enabled: config.enabled,
    name: config.name,
    systemPrompt: config.systemPrompt,
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    fallbackMessage: config.fallbackMessage,
    monthlyCostCapCop: config.monthlyCostCapCop?.toString() ?? "",
    templateId: config.templateId ?? "",
    checkoutFlowId: config.checkoutFlowId ?? "",
  });

  const handleTemplateChange = (template: string | null) => {
    if (!template) return;
    setValues({
      ...values,
      templateId: template,
      systemPrompt: PRESETS[template] || "",
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveAgentConfigAction({
          enabled: values.enabled,
          name: values.name,
          systemPrompt: values.systemPrompt,
          provider: values.provider as "openai" | "anthropic",
          model: values.model,
          temperature: Number(values.temperature),
          fallbackMessage: values.fallbackMessage,
          monthlyCostCapCop: values.monthlyCostCapCop ? Number(values.monthlyCostCapCop) : null,
          advancedMode: advancedOpen,
          templateId: values.templateId || null,
          checkoutFlowId: values.checkoutFlowId.trim() || null,
        });
        toast.success("Configuración guardada");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuración del agente</CardTitle>
        <CardDescription className="text-xs">
          Personaliza el comportamiento, modelo y parámetros de tu agente IA.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Enable toggle */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="enabled"
              checked={values.enabled}
              onCheckedChange={(checked) =>
                setValues({ ...values, enabled: checked === true })
              }
            />
            <label htmlFor="enabled" className="text-sm font-medium cursor-pointer">
              Agente activo
            </label>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre del agente</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              placeholder="Asistente"
            />
          </div>

          {/* Template select */}
          <div className="space-y-1.5">
            <Label htmlFor="template">Plantilla</Label>
            <Select value={values.templateId} onValueChange={handleTemplateChange}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Selecciona una plantilla..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="atencion">Atención al cliente</SelectItem>
                <SelectItem value="ventas">Ventas</SelectItem>
                <SelectItem value="reservas">Reservas</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Al seleccionar una plantilla, se llenará automáticamente las instrucciones.
            </p>
          </div>

          {/* System prompt */}
          <div className="space-y-1.5">
            <Label htmlFor="systemPrompt">Personalidad e instrucciones</Label>
            <textarea
              id="systemPrompt"
              value={values.systemPrompt}
              onChange={(e) => setValues({ ...values, systemPrompt: e.target.value })}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Define cómo debe comportarse tu agente..."
            />
          </div>

          {/* Fallback message */}
          <div className="space-y-1.5">
            <Label htmlFor="fallbackMessage">Mensaje de respaldo</Label>
            <Input
              id="fallbackMessage"
              value={values.fallbackMessage}
              onChange={(e) => setValues({ ...values, fallbackMessage: e.target.value })}
              placeholder="En un momento te atiende una persona del equipo."
            />
            <p className="text-xs text-muted-foreground">
              Se usa cuando el agente no puede resolver la solicitud.
            </p>
          </div>

          {/* Advanced section toggle */}
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              <span>{advancedOpen ? "▼" : "▶"}</span>
              Avanzado
            </button>
          </div>

          {/* Advanced section */}
          {advancedOpen && (
            <div className="space-y-6 border-l-2 border-muted pl-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Provider */}
                <div className="space-y-1.5">
                  <Label htmlFor="provider">Proveedor</Label>
                  <Select value={values.provider} onValueChange={(v) => {
                    if (v === "openai" || v === "anthropic") {
                      const list = CURATED_MODELS[v];
                      const stillValid = list.some((m) => m.id === values.model);
                      setValues({
                        ...values,
                        provider: v,
                        model: stillValid || customModel ? values.model : list[0].id,
                      });
                    }
                  }}>
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Model */}
                <div className="space-y-1.5">
                  <Label htmlFor="model">Modelo</Label>
                  <Select
                    value={customModel ? "__custom__" : values.model}
                    onValueChange={(v) => {
                      if (v === "__custom__") {
                        setCustomModel(true);
                      } else if (v) {
                        setCustomModel(false);
                        setValues({ ...values, model: v });
                      }
                    }}
                  >
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Selecciona un modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CURATED_MODELS[values.provider as "openai" | "anthropic"].map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label} · {m.cost} — {m.hint}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Personalizado…</SelectItem>
                    </SelectContent>
                  </Select>
                  {customModel && (
                    <Input
                      className="mt-2"
                      value={values.model}
                      onChange={(e) => setValues({ ...values, model: e.target.value })}
                      placeholder={values.provider === "openai" ? "gpt-5-mini" : "claude-haiku-4-5-20251001"}
                    />
                  )}
                </div>

                {/* Temperature */}
                <div className="space-y-1.5">
                  <Label htmlFor="temperature">Temperatura ({values.temperature.toFixed(1)})</Label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={values.temperature}
                    onChange={(e) =>
                      setValues({ ...values, temperature: Number(e.target.value) })
                    }
                    className="w-full cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = determinista, 1 = creativo
                  </p>
                </div>

                {/* Monthly cost cap */}
                <div className="space-y-1.5">
                  <Label htmlFor="monthlyCostCapCop">Tope de costo mensual (COP)</Label>
                  <Input
                    id="monthlyCostCapCop"
                    type="number"
                    value={values.monthlyCostCapCop}
                    onChange={(e) =>
                      setValues({ ...values, monthlyCostCapCop: e.target.value })
                    }
                    placeholder="Opcional"
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deja vacío para sin límite.
                  </p>
                </div>

                {/* Checkout flow ID */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="checkoutFlowId">Flow de checkout (ID del Flow publicado)</Label>
                  <Input
                    id="checkoutFlowId"
                    value={values.checkoutFlowId}
                    onChange={(e) =>
                      setValues({ ...values, checkoutFlowId: e.target.value })
                    }
                    placeholder="Opcional"
                  />
                  <p className="text-xs text-muted-foreground">
                    Publica un Flow con los campos de pago/entrega en Flows y pega su ID aquí. El agente lo envía con el resumen del pedido.
                  </p>
                </div>
              </div>
            </div>
          )}

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
