export function AgentBadge({
  agentEnabled,
  agentPaused,
}: {
  agentEnabled: boolean;
  agentPaused: boolean;
}) {
  if (!agentEnabled) return null;

  if (agentPaused) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        🧑 Humano
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
      🤖 IA
    </span>
  );
}
