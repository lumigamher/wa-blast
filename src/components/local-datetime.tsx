"use client";

import { useEffect, useState } from "react";

/**
 * Formatea una fecha ISO en la zona horaria LOCAL del navegador.
 * Los server components formatean con la zona del servidor (p. ej. CEST),
 * lo que mostraba horas equivocadas (4:27 p.m. local salía como 11:27 p.m.).
 * Este componente difiere el formateo al cliente para usar la zona del usuario.
 */
export function LocalDateTime({
  iso,
  opts,
  fallback = "…",
}: {
  iso: string | null | undefined;
  opts?: Intl.DateTimeFormatOptions;
  fallback?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) {
      setText(null);
      return;
    }
    setText(
      new Date(iso).toLocaleString("es-CO", opts ?? { dateStyle: "medium", timeStyle: "short" }),
    );
  }, [iso, opts]);

  return <span suppressHydrationWarning>{text ?? fallback}</span>;
}
