export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastIncomingAt: Date | null, now = new Date()): boolean {
  return !!lastIncomingAt && now.getTime() - lastIncomingAt.getTime() < WINDOW_MS;
}

export function windowExpiresAt(lastIncomingAt: Date): Date {
  return new Date(lastIncomingAt.getTime() + WINDOW_MS);
}
