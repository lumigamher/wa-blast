import { ShoppingCartIcon } from "lucide-react";

export default function DetailDefaultSlot() {
  return (
    <div className="flex min-h-0 flex-col items-center justify-center h-full rounded-lg border border-dashed">
      <ShoppingCartIcon className="size-12 text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">
        Selecciona un pedido
      </p>
    </div>
  );
}
