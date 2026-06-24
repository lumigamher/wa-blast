"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { isStaleActionError } from "./_stale-action";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = `${error?.message ?? ""} ${error?.digest ?? ""}`;
    if (typeof window !== "undefined" && isStaleActionError(msg)) {
      if (sessionStorage.getItem("sa-reloaded")) {
        sessionStorage.removeItem("sa-reloaded"); // segundo fallo seguido: no insistir, resetea para el próximo deploy
      } else {
        sessionStorage.setItem("sa-reloaded", "1");
        window.location.reload();
        return;
      }
    }
    console.error("[app-error] error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="rounded-lg border border-border bg-card p-6">
        <TriangleAlertIcon className="mx-auto mb-4 size-10 text-amber-500" />

        <h2 className="text-lg font-semibold">Algo salió mal</h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Ocurrió un error al cargar esta sección. Puedes reintentar; si persiste, revisa la configuración.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reintentar
          </button>

          <Link
            href="/panel"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
