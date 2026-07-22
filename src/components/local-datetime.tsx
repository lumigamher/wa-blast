"use client";

import { useEffect, useState } from "react";

/**
 * Formatea una fecha ISO en la zona horaria LOCAL del navegador.
 * Los server components formatean con la zona del servidor (p. ej. CEST),
 * lo que mostraba horas equivocadas. Difiere el formateo al cliente: en SSR (y
 * hasta montar) muestra `fallback`, y tras montar re-renderiza con la zona del
 * usuario.
 *
 * OJO: la versión anterior calculaba el texto en render con un check de
 * `typeof window` + `suppressHydrationWarning`. Eso NO funciona: al hidratar,
 * React conserva el texto del servidor (el fallback "…") y nunca lo corrige,
 * así que la hora quedaba pegada en "…". Con useEffect forzamos el re-render.
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
    // opts es un objeto literal nuevo por render; serializar evita re-correr en vano
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, JSON.stringify(opts)]);

  return <span suppressHydrationWarning>{text ?? fallback}</span>;
}
