function getLuminance(hexColor: string): number {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  // WCAG luminance formula
  const luminance =
    0.299 * r + 0.587 * g + 0.114 * b;
  return luminance;
}

function getTextColor(bgColor: string): string {
  const luminance = getLuminance(bgColor);
  return luminance > 0.5 ? "#111111" : "#ffffff";
}

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
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: label.color,
            color: getTextColor(label.color),
          }}
        >
          {label.name}
        </span>
      ))}
    </div>
  );
}
