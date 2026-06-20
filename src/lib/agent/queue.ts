const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce por conversación: reinicia el temporizador en cada mensaje; al pasar
 *  `delayMs` de silencio, corre `runner` una vez. */
export function enqueueAgentTurn(
  conversationId: string,
  runner: () => Promise<void>,
  delayMs: number,
): void {
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    timers.delete(conversationId);
    void runner().catch((e) => console.error("[agent] turn error", e));
  }, delayMs);
  timers.set(conversationId, t);
}

/** Solo para tests. */
export function __resetQueue(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
