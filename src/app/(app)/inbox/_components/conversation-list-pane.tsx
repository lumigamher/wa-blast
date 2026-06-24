"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SearchIcon, Check } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getInboxData } from "@/app/(app)/inbox/actions";
import { ContactAvatar } from "@/app/(app)/inbox/[id]/_components/contact-avatar";
import { AgentBadge } from "@/app/(app)/inbox/_components/agent-badge";
import { LabelChips } from "@/app/(app)/inbox/_components/label-chips";

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

export function ConversationListPane() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Awaited<ReturnType<typeof getInboxData>> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isInitial, setIsInitial] = useState(true);

  // Extract current filter params
  const q = searchParams.get("q") ?? undefined;
  const unreadOnly = searchParams.get("unreadOnly") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const agent = searchParams.get("agent") ?? undefined;
  const label = searchParams.get("label") ?? undefined;

  // Extract current active conversation ID from pathname
  const activeConvId = pathname.startsWith("/inbox/")
    ? pathname.split("/")[2]
    : null;

  // Load data on mount and when filters change
  useEffect(() => {
    startTransition(async () => {
      const newData = await getInboxData({
        q,
        unreadOnly,
        status,
        agent,
        label,
      });
      setData(newData);
      setIsInitial(false);
    });
  }, [q, unreadOnly, status, agent, label]);

  // Polling effect: refresh list every 5 seconds when document is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden && !isPending && !isInitial) {
        startTransition(async () => {
          const newData = await getInboxData({
            q,
            unreadOnly,
            status,
            agent,
            label,
          });
          setData(newData);
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [q, unreadOnly, status, agent, label, isPending, isInitial]);

  if (!data) {
    return (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="h-10 bg-muted rounded animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Helper function to build filter URL
  const buildFilterUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const finalQ = overrides.q !== undefined ? overrides.q : q;
    const finalUnreadOnly = overrides.unreadOnly !== undefined ? overrides.unreadOnly : unreadOnly;
    const finalStatus = overrides.status !== undefined ? overrides.status : status;
    const finalAgent = overrides.agent !== undefined ? overrides.agent : agent;
    const finalLabel = overrides.label !== undefined ? overrides.label : label;
    
    if (finalQ) params.set("q", finalQ);
    if (finalUnreadOnly) params.set("unreadOnly", finalUnreadOnly);
    if (finalStatus) params.set("status", finalStatus);
    if (finalAgent) params.set("agent", finalAgent);
    if (finalLabel) params.set("label", finalLabel);
    return `/inbox${params.toString() ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Search */}
      <form className="relative" onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newQ = (formData.get("q") as string) || undefined;
        router.replace(buildFilterUrl({ q: newQ }), { scroll: false });
      }}>
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
          href={buildFilterUrl({ status: undefined })}
          scroll={false}
          className={`text-xs px-3 py-1 rounded-l-full border transition-colors ${
            !status || status === "open"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          Abiertas
        </Link>
        <Link
          href={buildFilterUrl({ status: "resolved" })}
          scroll={false}
          className={`text-xs px-3 py-1 border-y transition-colors ${
            status === "resolved"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          Resueltas
        </Link>
        <Link
          href={buildFilterUrl({ status: "all" })}
          scroll={false}
          className={`text-xs px-3 py-1 rounded-r-full border transition-colors ${
            status === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          Todas
        </Link>
      </div>

      {/* Agent Filter */}
      {data.agentEnabled && (
        <div className="flex items-center gap-1">
          <Link
            href={buildFilterUrl({ agent: undefined })}
            scroll={false}
            className={`text-xs px-3 py-1 rounded-l-full border transition-colors ${
              !agent || agent === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            Todos
          </Link>
          <Link
            href={buildFilterUrl({ agent: "ia" })}
            scroll={false}
            className={`text-xs px-3 py-1 border-y transition-colors ${
              agent === "ia"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            🤖 IA
          </Link>
          <Link
            href={buildFilterUrl({ agent: "humano" })}
            scroll={false}
            className={`text-xs px-3 py-1 rounded-r-full border transition-colors ${
              agent === "humano"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            🧑 Humano
          </Link>
        </div>
      )}

      {/* Unread Filter */}
      <div className="flex items-center gap-1">
        <Link
          href={buildFilterUrl({ unreadOnly: unreadOnly ? undefined : "true" })}
          scroll={false}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            unreadOnly === "true"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          • No leídas
        </Link>
      </div>

      {/* Label Filter */}
      {data.allLabels.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Etiquetas:</span>
          <Link
            href={buildFilterUrl({ label: undefined })}
            scroll={false}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !label
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            Todas
          </Link>
          {data.allLabels.map((lbl) => (
            <Link
              key={lbl.id}
              href={buildFilterUrl({ label: lbl.id })}
              scroll={false}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors text-white ${
                label === lbl.id
                  ? "border-border"
                  : "border-border hover:opacity-80"
              }`}
              style={{
                backgroundColor: lbl.color,
                opacity: label === lbl.id ? 1 : 0.6,
              }}
            >
              {lbl.name}
            </Link>
          ))}
        </div>
      )}

      {/* Conversations List */}
      <div className="space-y-1 flex-1 overflow-y-auto">
        {data.conversations.length === 0 ? (
          <Card className="p-3">
            <p className="text-xs text-muted-foreground text-center">
              {q ? "No hay conversaciones" : "Tu inbox está vacío"}
            </p>
          </Card>
        ) : (
          data.conversations.map((conv) => {
            const isActive = activeConvId === conv.id;

            return (
              <Link
                key={conv.id}
                href={`/inbox/${conv.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
                scroll={false}
                className={`block p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors group ${
                  isActive ? "bg-accent border-primary" : ""
                }`}
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
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="text-sm font-medium truncate">
                          {conv.contactName || conv.phone}
                        </div>
                        {data.agentEnabled && (
                          <AgentBadge
                            agentEnabled={data.agentEnabled}
                            agentPaused={conv.agentPaused}
                          />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {conv.preview || "(sin mensaje)"}
                      </div>
                      {conv.labels.length > 0 && (
                        <div className="mt-1.5">
                          <LabelChips labels={conv.labels} />
                        </div>
                      )}
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
  );
}