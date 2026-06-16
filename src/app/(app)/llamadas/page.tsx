import Link from "next/link";
import { SearchIcon, PhoneMissedIcon, PhoneIncomingIcon, PhoneOutgoingIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listCalls } from "@/lib/calls/store";
import { ContactAvatar } from "../inbox/[id]/_components/contact-avatar";
import { LocalDateTime } from "@/components/local-datetime";

export const dynamic = "force-dynamic";

export default async function LlamadasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; direction?: string; q?: string }>;
}) {
  const { status, direction, q } = await searchParams;
  const { orgId } = await requireOrg();

  const calls = await listCalls(db, orgId, { status, direction, q });

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
    if (!durationSec) return null;
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
      <div>
        <h1 className="text-2xl font-bold">Llamadas</h1>
        <p className="text-sm text-muted-foreground">Registro de todas tus llamadas de WhatsApp</p>
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
              <p className="text-sm text-muted-foreground">{q ? "Sin llamadas encontradas" : "Sin llamadas todavía"}</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => (
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
                    {getDurationLabel(call.durationSec) && (
                      <div className="text-xs text-muted-foreground">{getDurationLabel(call.durationSec)}</div>
                    )}
                    <LocalDateTime iso={String(call.createdAt)} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
