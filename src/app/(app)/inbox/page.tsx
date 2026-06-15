import Link from "next/link";
import { SearchIcon, MessageSquareIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listConversations } from "@/lib/inbox/store";
import { Poller } from "./_components/poller";

export const dynamic = "force-dynamic";

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  for (const [key, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      if (interval === 1) return `Hace 1 ${key}`;
      if (key === "year" || key === "month" || key === "week" || key === "day") {
        return `Hace ${interval} ${key}s`;
      }
      return `Hace ${interval} ${key}s`;
    }
  }
  return "Hace unos segundos";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; unreadOnly?: string }>;
}) {
  const { q, unreadOnly } = await searchParams;
  const { orgId } = await requireOrg();

  const conversations = await listConversations(db, orgId, {
    q: q ?? undefined,
    unreadOnly: unreadOnly === "true",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* Left Panel: Conversation List */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* Search */}
          <form className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar…"
              className="pl-8"
            />
          </form>

          {/* Unread Toggle */}
          <div className="flex items-center gap-2">
            {unreadOnly === "true" ? (
              <Link
                href="/inbox"
                className="text-xs px-3 py-1 rounded-full border border-primary bg-primary text-primary-foreground transition-colors"
              >
                No leídas
              </Link>
            ) : (
              <Link
                href="/inbox?unreadOnly=true"
                className="text-xs px-3 py-1 rounded-full border hover:bg-muted transition-colors"
              >
                No leídas
              </Link>
            )}
          </div>

          {/* Conversations List */}
          <div className="space-y-1 flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <Card className="p-3">
                <p className="text-xs text-muted-foreground text-center">
                  {q ? "No hay conversaciones" : "Tu inbox está vacío"}
                </p>
              </Card>
            ) : (
              conversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/inbox/${conv.id}`}
                  className="block p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {conv.contactName || conv.phone}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {conv.preview || "(sin mensaje)"}
                      </div>
                    </div>
                    {conv.unreadCount > 0 && (
                      <div className="flex-shrink-0 flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                        {conv.unreadCount}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {formatRelativeTime(conv.lastMessageAt)}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Empty State */}
        <div className="flex min-h-0 flex-col items-center justify-center h-full rounded-lg border border-dashed">
          <MessageSquareIcon className="size-12 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Selecciona una conversación</p>
        </div>
      </div>

      <Poller />
    </div>
  );
}
