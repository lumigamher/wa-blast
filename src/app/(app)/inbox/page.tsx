import { requireModuleAccess } from "@/lib/billing/require-module";
import { Check, MessageSquareIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listConversations } from "@/lib/inbox/store";
import { Poller } from "./_components/poller";
import { ContactAvatar } from "./[id]/_components/contact-avatar";

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
      if (
        key === "year" ||
        key === "month" ||
        key === "week" ||
        key === "day"
      ) {
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
  searchParams: Promise<{ q?: string; unreadOnly?: string; status?: string }>;
}) {
  await requireModuleAccess("inbox");
  const { q, unreadOnly, status } = await searchParams;
  const { orgId } = await requireOrg();

  const conversations = await listConversations(db, orgId, {
    q: q ?? undefined,
    unreadOnly: unreadOnly === "true",
    status: (status as "open" | "resolved" | "all" | undefined) ?? undefined,
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

          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <Link
              href={`/inbox${q ? `?q=${encodeURIComponent(q)}` : ""}${unreadOnly === "true" ? (q ? "&" : "?") + "unreadOnly=true" : ""}`}
              className={`text-xs px-3 py-1 rounded-l-full border transition-colors ${
                !status || status === "open"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              Abiertas
            </Link>
            <Link
              href={`/inbox?status=resolved${q ? `&q=${encodeURIComponent(q)}` : ""}${unreadOnly === "true" ? "&unreadOnly=true" : ""}`}
              className={`text-xs px-3 py-1 border-y transition-colors ${
                status === "resolved"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              Resueltas
            </Link>
            <Link
              href={`/inbox?status=all${q ? `&q=${encodeURIComponent(q)}` : ""}${unreadOnly === "true" ? "&unreadOnly=true" : ""}`}
              className={`text-xs px-3 py-1 rounded-r-full border transition-colors ${
                status === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              Todas
            </Link>
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
              conversations.map((conv) => {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                if (unreadOnly === "true") params.set("unreadOnly", "true");
                if (status) params.set("status", status);
                const href = `/inbox/${conv.id}${params.toString() ? `?${params.toString()}` : ""}`;

                return (
                  <Link
                    key={conv.id}
                    href={href}
                    className="block p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <ContactAvatar
                          seed={conv.phone}
                          name={conv.contactName}
                          size={40}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {conv.contactName || conv.phone}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {conv.preview || "(sin mensaje)"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {conv.status === "resolved" && (
                          <div title="Resuelta">
                            <Check className="size-3 text-muted-foreground" />
                          </div>
                        )}
                        {conv.unreadCount > 0 && (
                          <div className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                            {conv.unreadCount}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {formatRelativeTime(conv.lastMessageAt)}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Empty State */}
        <div className="flex min-h-0 flex-col items-center justify-center h-full rounded-lg border border-dashed">
          <MessageSquareIcon className="size-12 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            Selecciona una conversación
          </p>
        </div>
      </div>

      <Poller />
    </div>
  );
}
