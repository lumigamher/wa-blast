"use client";

import { PauseIcon, PlayIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  adminExtendAction,
  adminSetPlanAction,
  adminSetSuspendedAction,
} from "../actions";

const PLAN_OPTIONS: { value: "esencial" | "pro" | "premium"; label: string }[] =
  [
    { value: "esencial", label: "Esencial" },
    { value: "pro", label: "Pro" },
    { value: "premium", label: "Premium" },
  ];

export function OrgActions({
  orgId,
  subStatus,
  planId,
}: {
  orgId: string;
  subStatus: "none" | "active" | "expired" | "suspended";
  planId: "esencial" | "pro" | "premium";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function changePlan(next: string) {
    if (next === planId) return;
    startTransition(async () => {
      const result = await adminSetPlanAction(orgId, next);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Plan actualizado");
      router.refresh();
    });
  }

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
    <div className="flex items-center gap-2">
      <select
        value={planId}
        onChange={(e) => changePlan(e.target.value)}
        disabled={pending}
        aria-label="Plan de la organización"
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        {PLAN_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
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
