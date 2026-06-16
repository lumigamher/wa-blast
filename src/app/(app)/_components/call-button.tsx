"use client";

import { useState } from "react";
import { PhoneIcon } from "lucide-react";
import { toast } from "sonner";
import { getCallPermissionAction, requestCallPermissionAction } from "../llamadas/actions";

export function CallButton({
  contactId,
  name,
  phone,
  className,
}: {
  contactId: string;
  name?: string | null;
  phone?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const perm = await getCallPermissionAction(contactId);
      if (perm.valid) {
        window.dispatchEvent(
          new CustomEvent("lula:place-call", { detail: { contactId, name, phone } }),
        );
        return;
      }
      const res = await requestCallPermissionAction(contactId);
      if ("error" in res) {
        toast.error(`No se pudo pedir permiso: ${res.error}`);
      } else {
        toast("📞 Permiso de llamada solicitado", {
          description: "Te avisamos cuando el contacto acepte; entonces podrás llamar.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      }
    >
      <PhoneIcon className="size-4" /> Llamar
    </button>
  );
}
