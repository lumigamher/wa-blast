"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { setAgentToolAction } from "./actions";

const BUILTIN_TOOLS = [
  { key: "calcular_total", label: "Calcular totales" },
  { key: "escalar_a_humano", label: "Escalar a humano" },
  { key: "recopilar_datos", label: "Recopilar datos" },
];

export function AgentTools({ enabled }: { enabled: Record<string, boolean> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleToggle = (key: string, nextEnabled: boolean) => {
    startTransition(async () => {
      try {
        const result = await setAgentToolAction(key, nextEnabled);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          toast.success(nextEnabled ? "Herramienta habilitada" : "Herramienta deshabilitada");
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cambiar herramienta");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Herramientas</CardTitle>
        <CardDescription className="text-xs">
          Conectores HTTP a APIs externas — próximamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {BUILTIN_TOOLS.map((tool) => (
            <div key={tool.key} className="flex items-center gap-3">
              <Checkbox
                id={tool.key}
                checked={enabled[tool.key] ?? true}
                onCheckedChange={(checked) =>
                  handleToggle(tool.key, checked === true)
                }
                disabled={isPending}
              />
              <label htmlFor={tool.key} className="text-sm font-medium cursor-pointer">
                {tool.label}
              </label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
