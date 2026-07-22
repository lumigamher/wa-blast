"use client";

import { useEffect, useState } from "react";

/**
 * Formatea una fecha ISO en la zona horaria LOCAL del navegador.
 * Los server components formatean con la zona del servidor (p. ej. CEST),
 * lo que mostraba horas equivocadas. Difiere el formateo al cliente: en SSR
 * (y hasta montar) muestra `fallback`, y tras montar re-renderiza con la zona
 * del usuario.
 *
 * Nota: NO se puede usar `suppressHydrationWarning` para "arreglar" esto sin
 * estado — React conserva el texto del servidor al hidratar y nunca lo corrige,
 * dejándolo pegado en el fallback. Por eso usamos useEffect para forzar el
 * re-render en el cliente.
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
    // opts es un objeto literal nuevo en cada render; serializar evita re-correr en vano
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, JSON.stringify(opts)]);

  return <span suppressHydrationWarning>{text ?? fallback}</span>;
}
