"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminSetPriceAction } from "../actions";

type PlanRow = {
  id: "esencial" | "pro" | "premium";
  name: string;
  priceCop: number;
};

export function PriceEditor({ catalog }: { catalog: PlanRow[] }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <h3 className="mb-4 text-sm font-medium">Precios de los planes (COP/mes)</h3>
      <div className="space-y-3">
        {catalog.map((plan) => (
          <PlanPriceRow
            key={plan.id}
            id={plan.id}
            name={plan.name}
            priceCop={plan.priceCop}
          />
        ))}
      </div>
    </div>
  );
}

function PlanPriceRow({ id, name, priceCop }: PlanRow) {
  const [price, setPrice] = useState(String(priceCop));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Precio inválido");
      return;
    }
    startTransition(async () => {
      const result = await adminSetPriceAction(id, n);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Precio de ${name} actualizado`);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Label htmlFor={`plan-price-${id}`} className="text-xs mb-2 block">
          {name}
        </Label>
        <Input
          id={`plan-price-${id}`}
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
  );
}
