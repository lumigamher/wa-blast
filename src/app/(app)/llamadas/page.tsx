import Link from "next/link";
import { SearchIcon, PhoneMissedIcon, PhoneIncomingIcon, PhoneOutgoingIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listCalls } from "@/lib/calls/store";
import { ContactAvatar } from "../inbox/[id]/_components/contact-avatar";
import { LocalDateTime } from "@/components/local-datetime";
import { NuevaLlamada } from "./_nueva-llamada";

export const dynamic = "force-dynamic";

export default async function LlamadasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; direction?: string; q?: string }>;
}) {
  const { status, direction, q } = await searchParams;
  const { orgId } = await requireOrg();

  const calls = await listCalls(db, orgId, { status, direction, q });
  const missedCount =
    status === "missed" && !direction && !q
      ? calls.length
      : (await listCalls(db, orgId, { status: "missed" })).length;

  function dayLabel(d: Date): string {
    const now = new Date();
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return "Hoy";
    if (sameDay(d, yesterday)) return "Ayer";
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  }

  const groups: { label: string; items: typeof calls }[] = [];
  for (const call of calls) {
    const label = dayLabel(new Date(call.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(call);
    else groups.push({ label, items: [call] });
  }

  function getStatusIcon(call: typeof calls[0]) {
    const missed = call.status === "missed" || call.status === "rejected" || call.status === "failed";
    if (missed) return <PhoneMissedIcon className="size-4 text-red-600 dark:text-red-400" />;
    return call.direction === "out" ? (
      <PhoneOutgoingIcon className="size-4 text-muted-foreground" />
    ) : (
      <PhoneIncomingIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
    );
  }

  function getStatusLabel(call: typeof calls[0]) {
    const missed = call.status === "missed" || call.status === "rejected" || call.status === "failed";
    if (missed) return "Perdida";
    return call.direction === "out" ? "Saliente" : "Contestada";
  }

  function getDurationLabel(durationSec: number | null) {
    if (!durationSec) return "—";
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  const filters = [
    { label: "Todas", href: "/llamadas", isActive: !status && !direction },
    { label: "Perdidas", href: "?status=missed", isActive: status === "missed" },
    { label: "Contestadas", href: "?status=completed", isActive: status === "completed" },
    { label: "Entrantes", href: "?direction=in", isActive: direction === "in" && !status },
    { label: "Salientes", href: "?direction=out", isActive: direction === "out" && !status },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Llamadas</h1>
          <p className="text-sm text-muted-foreground">Registro de todas tus llamadas de WhatsApp</p>
        </div>
        <NuevaLlamada />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {filters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filter.isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            {filter.label}
            {filter.label === "Perdidas" && missedCount > 0 && (
              <span
                aria-label={`${missedCount} llamadas perdidas`}
                className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white"
              >
                {missedCount}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Search */}
      <form className="relative max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar…" className="pl-8" />
      </form>

      {/* Calls List */}
      <div className="flex-1 overflow-y-auto">
        {calls.length === 0 ? (
          <Card className="p-8 flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {q
                  ? "Sin llamadas encontradas"
                  : status === "missed"
                    ? "Sin llamadas perdidas"
                    : status === "completed"
                      ? "Sin llamadas contestadas"
                      : direction === "in"
                        ? "Sin llamadas entrantes"
                        : direction === "out"
                          ? "Sin llamadas salientes"
                          : "Sin llamadas todavía"}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((call) => (
                  <Link
                    key={call.id}
                    href={`/inbox/${call.conversationId}`}
                    className="block p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <ContactAvatar seed={call.phone} name={call.contactName} size={40} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{call.contactName || call.phone}</div>
                          <div className="text-xs text-muted-foreground">{call.phone}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          {getStatusIcon(call)}
                          <span>{getStatusLabel(call)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{getDurationLabel(call.durationSec)}</div>
                        {call.recordingMediaId && (
                          <audio
                            controls
                            preload="none"
                            src={`/media/${call.recordingMediaId}`}
                            className="h-8 max-w-[180px]"
                          />
                        )}
                        <LocalDateTime iso={String(call.createdAt)} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
