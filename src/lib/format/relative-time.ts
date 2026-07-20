/** Tiempo relativo compacto en español: "ahora", "5 min", "2 h", "ayer", "3 d", "12 jul". */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.ceil((startOfToday.getTime() - date.getTime()) / 86_400_000);
  if (daysAgo <= 1) return "ayer";
  if (daysAgo < 7) return `${daysAgo} d`;
  return date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/** Minutos transcurridos desde una fecha. */
export function minutesSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / 60_000);
}
