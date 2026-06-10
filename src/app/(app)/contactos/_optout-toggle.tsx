"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { toggleOptOutAction } from "./actions";

/** Badge clickeable: alterna el opt-out manual de un contacto. */
export function OptOutToggle({ contactId, optedOut }: { contactId: string; optedOut: boolean }) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const res = await toggleOptOutAction(contactId);
      if (!res.ok) {
        toast.error("No pude actualizar el contacto");
        return;
      }
      toast.success(
        res.optedOut
          ? "Contacto excluido de futuros envíos"
          : "Contacto reactivado para envíos",
      );
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={optedOut ? "Click para reactivar envíos" : "Click para excluir de envíos"}
      className="disabled:opacity-50"
    >
      {optedOut ? (
        <Badge variant="destructive">opt-out</Badge>
      ) : (
        <Badge variant="outline">activo</Badge>
      )}
    </button>
  );
}
