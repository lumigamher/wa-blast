"use client";

/**
 * Formatea una fecha ISO en la zona horaria LOCAL del navegador.
 * Los server components formatean con la zona del servidor (p. ej. CEST),
 * lo que mostraba horas equivocadas (4:27 p.m. local salía como 11:27 p.m.).
 * Difiere el formateo al cliente: en el servidor (SSR) muestra `fallback` y al
 * hidratar usa la zona del usuario. `suppressHydrationWarning` evita el aviso
 * por la diferencia esperada server↔cliente.
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
  const text =
    typeof window !== "undefined" && iso
      ? new Date(iso).toLocaleString("es-CO", opts ?? { dateStyle: "medium", timeStyle: "short" })
      : null;
  return <span suppressHydrationWarning>{text ?? fallback}</span>;
}
