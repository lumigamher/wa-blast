export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastIncomingAt: Date | null, now = new Date()): boolean {
  return !!lastIncomingAt && now.getTime() - lastIncomingAt.getTime() < WINDOW_MS;
}

export function windowExpiresAt(lastIncomingAt: Date): Date {
  return new Date(lastIncomingAt.getTime() + WINDOW_MS);
}

/** Horas restantes de la ventana de 24h (mínimo 1 mientras esté abierta). */
export function windowHoursLeft(lastIncomingAt: Date, now = new Date()): number {
  const ms = windowExpiresAt(lastIncomingAt).getTime() - now.getTime();
  return Math.max(1, Math.floor(ms / 3_600_000));
}
