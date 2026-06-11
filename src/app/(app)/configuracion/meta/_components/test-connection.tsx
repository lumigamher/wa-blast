"use client";

import { useActionState } from "react";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testConnectionAction } from "../../actions";

type TestConnectionState = Awaited<ReturnType<typeof testConnectionAction>>;

export function TestConnection() {
  const [state, formAction, pending] = useActionState(async () => {
    return testConnectionAction();
  }, null as TestConnectionState | null);

  return (
    <div className="space-y-3">
      <div>
        <Button onClick={() => formAction()} disabled={pending} type="button">
          {pending ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" /> Probando...
            </>
          ) : (
            "Probar conexión"
          )}
        </Button>
      </div>

      {state && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            state.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/10 dark:text-emerald-100"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-600 dark:bg-red-900/10 dark:text-red-100"
          }`}
        >
          {state.ok ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2Icon className="size-4" />
                <span className="font-medium">Conexión exitosa</span>
              </div>
              <div className="ml-6 space-y-0.5 text-xs opacity-90">
                <p>
                  <b>Número:</b> {state.phone}
                </p>
                <p>
                  <b>Nombre verificado:</b> {state.name || "(no configurado)"}
                </p>
                {state.quality && (
                  <p>
                    <b>Calidad:</b> {state.quality}
                  </p>
                )}
                {state.tier && (
                  <p>
                    <b>Tier:</b> {state.tier}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">Error de conexión</div>
                <div className="mt-1 text-xs opacity-90">{state.error}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
