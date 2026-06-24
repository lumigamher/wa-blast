export function LabelChips({
  labels,
}: {
  labels: { id: string; name: string; color: string }[];
}) {
  if (!labels.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
          style={{
            backgroundColor: label.color,
          }}
        >
          {label.name}
        </span>
      ))}
    </div>
  );
}
