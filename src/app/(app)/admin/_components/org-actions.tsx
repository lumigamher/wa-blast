"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseIcon, PlayIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminExtendAction, adminSetSuspendedAction } from "../actions";

export function OrgActions({
  orgId,
  subStatus,
}: {
  orgId: string;
  subStatus: "none" | "active" | "expired" | "suspended";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function extend() {
    startTransition(async () => {
      const result = await adminExtendAction(orgId, 30);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Suscripción extendida 30 días");
      router.refresh();
    });
  }

  function toggleSuspended() {
    const suspended = subStatus === "active" || subStatus === "expired";
    startTransition(async () => {
      const result = await adminSetSuspendedAction(orgId, suspended);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(suspended ? "Organización suspendida" : "Organización reactivada");
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={extend} disabled={pending}>
        <PlusIcon className="size-3.5" />
        +30 días
      </Button>
      <Button variant="outline" size="sm" onClick={toggleSuspended} disabled={pending}>
        {subStatus === "suspended" ? (
          <>
            <PlayIcon className="size-3.5" />
            Reactivar
          </>
        ) : (
          <>
            <PauseIcon className="size-3.5" />
            Suspender
          </>
        )}
      </Button>
    </div>
  );
}
