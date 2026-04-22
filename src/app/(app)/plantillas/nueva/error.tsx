"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/plantillas/nueva] error:", error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-md border border-destructive/40 bg-destructive/5 p-6">
      <h2 className="text-lg font-semibold">Error al cargar la página</h2>
      <pre className="whitespace-pre-wrap break-words rounded bg-background p-3 text-xs">
        {error.message}
        {error.stack ? `\n\n${error.stack}` : ""}
      </pre>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Digest: {error.digest}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={reset} size="sm">
          Reintentar
        </Button>
        <Link
          href="/plantillas"
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent"
        >
          Volver
        </Link>
      </div>
    </div>
  );
}
