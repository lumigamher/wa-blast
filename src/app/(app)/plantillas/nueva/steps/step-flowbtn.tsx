"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplateDraft, FlowOption } from "../template-wizard";

export function StepFlowBtn({
  draft,
  update,
  flows = [],
}: {
  draft: TemplateDraft;
  update: (p: Partial<TemplateDraft>) => void;
  flows: FlowOption[];
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Botón del Flow</h2>
      {flows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tienes Flows publicados. Crea y publica un Flow primero (los Flows en
          estado PENDING aún no aparecen aquí).
        </p>
      ) : (
        <>
          <div>
            <Label>Flow que abre el botón</Label>
            <Select
              value={draft.flowButtonFlowId}
              onValueChange={(v) => v && update({ flowButtonFlowId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elige un Flow publicado" />
              </SelectTrigger>
              <SelectContent>
                {flows.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="flowbtn-text">Texto del botón (máx 25)</Label>
            <Input
              id="flowbtn-text"
              maxLength={25}
              value={draft.flowButtonText}
              onChange={(e) => update({ flowButtonText: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
