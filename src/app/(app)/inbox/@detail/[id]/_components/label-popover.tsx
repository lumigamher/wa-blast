"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TagsIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  setConversationLabelsAction,
  createLabelAction,
} from "@/app/(app)/inbox/actions";

const COLOR_PRESETS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#8b5cf6", // purple
  "#ec4899", // pink
];

export function LabelPopover({
  conversationId,
  allLabels,
  currentLabelIds,
}: {
  conversationId: string;
  allLabels: { id: string; name: string; color: string }[];
  currentLabelIds: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(currentLabelIds);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(COLOR_PRESETS[0]!);
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [open, setOpen] = useState(false);

  const handleToggleLabel = (labelId: string) => {
    setSelectedIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    );
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await setConversationLabelsAction(conversationId, selectedIds);
      if ("ok" in result && result.ok) {
        setOpen(false);
        router.refresh();
      } else if ("error" in result) {
        toast.error(result.error || "No se pudo guardar las etiquetas");
      }
    });
  };

  const handleCreateLabel = () => {
    if (!newLabelName.trim()) return;
    startTransition(async () => {
      const result = await createLabelAction({
        name: newLabelName,
        color: newLabelColor,
      });
      if ("ok" in result && result.ok) {
        setSelectedIds([...selectedIds, result.id]);
        setNewLabelName("");
        setNewLabelColor(COLOR_PRESETS[0]!);
        setShowNewLabel(false);
        router.refresh();
      } else if ("error" in result) {
        toast.error(result.error || "No se pudo crear la etiqueta");
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>
        <Button variant="outline" size="sm" className="h-9">
          <TagsIcon className="size-4" />
          Etiquetas
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Etiquetas</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {/* Existing Labels */}
          {allLabels.length > 0 && (
            <div className="space-y-2">
              {allLabels.map((label) => (
                <label
                  key={label.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={selectedIds.includes(label.id)}
                    onCheckedChange={() => handleToggleLabel(label.id)}
                    disabled={isPending}
                  />
                  <span
                    className="text-xs font-medium text-white px-2 py-1 rounded text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Separator */}
          {allLabels.length > 0 && (
            <div className="border-t border-border" />
          )}

          {/* Create New Label */}
          {!showNewLabel ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => setShowNewLabel(true)}
              disabled={isPending}
            >
              + Crear etiqueta
            </Button>
          ) : (
            <div className="space-y-2 p-2 border border-border rounded-lg">
              <Input
                placeholder="Nombre de etiqueta"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                disabled={isPending}
                className="h-8 text-xs"
              />
              <div className="flex gap-1 flex-wrap">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    className="size-6 rounded border-2 transition-all"
                    style={{
                      backgroundColor: color,
                      borderColor: newLabelColor === color ? "#000" : "transparent",
                    }}
                    onClick={() => setNewLabelColor(color)}
                    disabled={isPending}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                  onClick={handleCreateLabel}
                  disabled={!newLabelName.trim() || isPending}
                >
                  Crear
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setShowNewLabel(false);
                    setNewLabelName("");
                    setNewLabelColor(COLOR_PRESETS[0]!);
                  }}
                  disabled={isPending}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={isPending}
        >
          Guardar
        </Button>
      </SheetContent>
    </Sheet>
  );
}
