"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "lucide-react";

export function CheckoutForm({
  buttonLabel,
  action,
  planId,
}: {
  buttonLabel: string;
  action: (planId?: string) => Promise<{ error: string } | never>;
  planId?: string;
}) {
  const boundAction = () => action(planId);
  const [state, formAction, isPending] = useActionState(boundAction, null);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-500">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Procesando..." : buttonLabel}
      </Button>
    </form>
  );
}
