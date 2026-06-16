import { PhoneIncomingIcon, PhoneMissedIcon, PhoneOutgoingIcon } from "lucide-react";

export function CallEntry({
  call,
}: {
  call: {
    direction: "in" | "out";
    status: string;
    durationSec: number | null;
    createdAt: Date;
    recordingMediaId?: string | null;
  };
}) {
  const missed =
    call.status === "missed" ||
    call.status === "rejected" ||
    call.status === "failed";
  const Icon = missed
    ? PhoneMissedIcon
    : call.direction === "out"
      ? PhoneOutgoingIcon
      : PhoneIncomingIcon;
  const dur = call.durationSec
    ? `${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, "0")}`
    : null;
  const label = missed
    ? call.direction === "out"
      ? "Llamada no contestada"
      : "Llamada perdida"
    : call.direction === "out"
      ? `Llamada saliente${dur ? ` · ${dur}` : ""}`
      : `Llamada contestada${dur ? ` · ${dur}` : ""}`;
  const time = call.createdAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="my-2 flex flex-col items-center gap-1">
      <div
        className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
          missed
            ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-3.5" /> <span>{label}</span>{" "}
        <span className="opacity-60">{time}</span>
      </div>
      {call.recordingMediaId && (
        <audio controls preload="none" src={`/media/${call.recordingMediaId}`} className="h-8 max-w-[240px]" />
      )}
    </div>
  );
}
