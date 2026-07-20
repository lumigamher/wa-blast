"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function FilterDialog({
  activeCount,
  onOpen,
  onApply,
  onClear,
  compact = false,
  children,
}: {
  activeCount: number;
  onOpen?: () => void;
  onApply: () => void;
  onClear: () => void;
  /** Trigger solo-ícono para caber junto a otros controles */
  compact?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const handleOpen = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && onOpen) {
      onOpen();
    }
  };

  const handleApply = () => {
    onApply();
    setOpen(false);
  };

  return (
    <>
      {compact ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleOpen(true)}
          className="relative h-[34px] w-[34px] shrink-0 p-0"
          aria-label="Más filtros"
          title="Más filtros"
        >
          <SlidersHorizontal className="size-4" />
          {activeCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleOpen(true)}
          className="w-full justify-start"
        >
          <SlidersHorizontal className="size-4 mr-2" />
          Filtros
          {activeCount > 0 && (
            <span className="ml-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground h-5 w-5 text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">{children}</div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={onClear}>
              Limpiar
            </Button>
            <Button size="sm" onClick={handleApply}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
