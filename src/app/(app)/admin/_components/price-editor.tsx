"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminSetPriceAction } from "../actions";

export function PriceEditor({ currentPrice }: { currentPrice: number }) {
  const [price, setPrice] = useState(String(currentPrice));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Precio inválido");
      return;
    }
    startTransition(async () => {
      const result = await adminSetPriceAction(n);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Precio actualizado");
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border bg-background p-4">
      <h3 className="mb-4 text-sm font-medium">Precio del plan (COP/mes)</h3>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="plan-price" className="text-xs mb-2 block">
            Valor en COP
          </Label>
          <Input
            id="plan-price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min="0"
            step="1000"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={save} disabled={pending} size="sm">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
