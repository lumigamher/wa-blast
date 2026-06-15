export function ReactionChips({
  reactions,
}: {
  reactions: { direction: "in" | "out"; emoji: string }[];
}) {
  if (!reactions.length) return null;

  return (
    <div className="absolute -bottom-2 right-1 flex gap-0.5 rounded-full border bg-background px-1 py-0.5 shadow-sm">
      {reactions.map((r, i) => (
        <span key={i} className="text-xs leading-none">
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
