"use client";

import { Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplateDraft, ButtonState, FlowOption } from "../template-wizard";

export function StepBotones({
  draft,
  update,
  flows = [],
}: {
  draft: TemplateDraft;
  update: (p: Partial<TemplateDraft>) => void;
  flows?: FlowOption[];
}) {
  function addButton(kind: "QUICK_REPLY" | "URL" | "FLOW") {
    if (draft.buttons.length >= 3) return;
    if (kind === "URL" && draft.buttons.filter((b) => b.kind === "URL").length >= 2)
      return;
    update({
      buttons: [
        ...draft.buttons,
        {
          id: crypto.randomUUID(),
          kind,
          text: "",
          url: "",
          flowId: kind === "FLOW" ? flows[0]?.id : undefined,
        },
      ],
    });
  }

  function updateButton(id: string, patch: Partial<ButtonState>) {
    update({
      buttons: draft.buttons.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  }

  function removeButton(id: string) {
    update({
      buttons: draft.buttons.filter((x) => x.id !== id),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Botones</h2>
        <p className="text-sm text-muted-foreground">Los botones son opcionales.</p>
      </div>

      {draft.buttons.map((b) => (
        <div
          key={b.id}
          className="flex flex-wrap items-end gap-2 rounded-md border p-3"
        >
          <div className="min-w-[100px]">
            <Label className="text-[11px]">Tipo</Label>
            <Badge variant="secondary" className="mt-1 block w-fit">
              {b.kind === "URL" ? "URL" : b.kind === "FLOW" ? "Flow" : "Respuesta rápida"}
            </Badge>
          </div>
          <div className="min-w-[150px] flex-1">
            <Label className="text-[11px]">Texto (máx 25)</Label>
            <Input
              value={b.text}
              maxLength={25}
              onChange={(e) => updateButton(b.id, { text: e.target.value })}
            />
          </div>
          {b.kind === "URL" && (
            <div className="min-w-[200px] flex-1">
              <Label className="text-[11px]">URL</Label>
              <Input
                value={b.url}
                placeholder="https://..."
                onChange={(e) => updateButton(b.id, { url: e.target.value })}
              />
            </div>
          )}
          {b.kind === "FLOW" && (
            <div className="min-w-[200px] flex-1">
              <Label className="text-[11px]">Flow</Label>
              <Select value={(b.flowId as string) || ""} onValueChange={(flowId: string | null) => {if (flowId) updateButton(b.id, { flowId })}}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un Flow" />
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
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeButton(b.id)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addButton("QUICK_REPLY")}
          disabled={draft.buttons.length >= 3}
        >
          + Respuesta rápida
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addButton("URL")}
          disabled={
            draft.buttons.length >= 3 ||
            draft.buttons.filter((b) => b.kind === "URL").length >= 2
          }
        >
          + Botón URL
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addButton("FLOW")}
          disabled={draft.buttons.length >= 3 || flows.length === 0}
          title={flows.length === 0 ? "Crea y publica un Flow primero en /flows" : undefined}
        >
          + Botón Flow
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Máx 3 botones. Si hay URL, solo se permiten hasta 2 de URL.
        {flows.length === 0 && <> Crea y publica un Flow primero en /flows para usar botones Flow.</>}
      </p>
    </div>
  );
}
