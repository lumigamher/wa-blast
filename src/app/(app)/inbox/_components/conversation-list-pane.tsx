"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchIcon, Check, Bot, User } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterDialog } from "@/app/(app)/_components/filter-dialog";
import { getInboxData } from "@/app/(app)/inbox/actions";
import { ContactAvatar } from "@/app/(app)/inbox/_components/contact-avatar";
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

interface VirtualizedConversationListProps {
  conversations: Awaited<ReturnType<typeof getInboxData>>["conversations"];
  data: Awaited<ReturnType<typeof getInboxData>>;
  activeConvId: string | null;
  searchParams: ReturnType<typeof useSearchParams>;
  parentRef: React.RefObject<HTMLDivElement | null>;
}

function VirtualizedConversationList({
  conversations,
  data,
  activeConvId,
  searchParams,
  parentRef,
}: VirtualizedConversationListProps) {
  const rowVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto min-h-0">
      <div style={{ height: totalSize, position: "relative" }}>
        {virtualItems.map((virtualItem) => {
          const conv = conversations[virtualItem.index];
          const isActive = activeConvId === conv.id;

          return (
            <Link
              key={conv.id}
              href={`/inbox/${conv.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
              scroll={false}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
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
        })}
      </div>
    </div>
  );
}

export function ConversationListPane() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parentRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<Awaited<ReturnType<typeof getInboxData>> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isInitial, setIsInitial] = useState(true);

  // Extract current filter params
  const q = searchParams.get("q") ?? undefined;
  const unreadOnly = searchParams.get("unreadOnly") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const agent = searchParams.get("agent") ?? undefined;
  const label = searchParams.get("label") ?? undefined;

  // Draft state for filter modal
  const [draftStatus, setDraftStatus] = useState(status || "open");
  const [draftAgent, setDraftAgent] = useState(agent || "all");
  const [draftUnreadOnly, setDraftUnreadOnly] = useState(unreadOnly === "true");
  const [draftLabel, setDraftLabel] = useState(label || "");

  // Reset draft when dialog opens
  const resetDraft = () => {
    setDraftStatus(status || "open");
    setDraftAgent(agent || "all");
    setDraftUnreadOnly(unreadOnly === "true");
    setDraftLabel(label || "");
  };

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

  // Polling effect: refresh list every 15 seconds when document is visible and online
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden && navigator.onLine && !isPending && !isInitial) {
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
    }, 15000);

    return () => clearInterval(interval);
  }, [q, unreadOnly, status, agent, label, isPending, isInitial]);

  if (!data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="h-10 bg-muted rounded animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const activeFilterCount = [
    status ? 1 : 0,
    data?.agentEnabled && agent ? 1 : 0,
    unreadOnly === "true" ? 1 : 0,
    label ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Apply filters to draft state and close dialog
  const applyFilters = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);

    // Status: only set if not the default "open"
    if (draftStatus && draftStatus !== "open") {
      params.set("status", draftStatus);
    }

    // Agent: only set if not "all"
    if (data?.agentEnabled && draftAgent && draftAgent !== "all") {
      params.set("agent", draftAgent);
    }

    // Unread
    if (draftUnreadOnly) {
      params.set("unreadOnly", "true");
    }

    // Label
    if (draftLabel) {
      params.set("label", draftLabel);
    }

    const newUrl = `/inbox${params.toString() ? `?${params.toString()}` : ""}`;
    router.replace(newUrl, { scroll: false });
  };

  const clearFilters = () => {
    setDraftStatus("open");
    setDraftAgent("all");
    setDraftUnreadOnly(false);
    setDraftLabel("");
    router.replace("/inbox", { scroll: false });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      {/* Search */}
      <form className="relative" onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newQ = (formData.get("q") as string) || undefined;
        const params = new URLSearchParams();
        if (newQ) params.set("q", newQ);
        if (status) params.set("status", status);
        if (agent) params.set("agent", agent);
        if (unreadOnly) params.set("unreadOnly", unreadOnly);
        if (label) params.set("label", label);
        router.replace(`/inbox${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
      }}>
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar…"
          className="pl-8"
        />
      </form>

      {/* Filters Button */}
      <div className="flex gap-2">
        <FilterDialog
          activeCount={activeFilterCount}
          onOpen={resetDraft}
          onApply={applyFilters}
          onClear={clearFilters}
        >
          {/* Estado */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Estado</label>
            <div className="grid grid-cols-3 gap-2">
              {["open", "resolved", "all"].map((value) => (
                <button
                  key={value}
                  onClick={() => setDraftStatus(value)}
                  className={`text-xs py-2 px-3 rounded border transition-colors ${
                    draftStatus === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {value === "open"
                    ? "Abiertas"
                    : value === "resolved"
                      ? "Resueltas"
                      : "Todas"}
                </button>
              ))}
            </div>
          </div>

          {/* Agent */}
          {data?.agentEnabled && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Agente</label>
              <div className="grid grid-cols-3 gap-2">
                {["all", "ia", "humano"].map((value) => (
                  <button
                    key={value}
                    onClick={() => setDraftAgent(value)}
                    className={`text-xs py-2 px-3 rounded border transition-colors flex items-center justify-center gap-1 ${
                      draftAgent === value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {value === "ia" && <Bot className="size-3" />}
                    {value === "humano" && <User className="size-3" />}
                    {value === "all"
                      ? "Todos"
                      : value === "ia"
                        ? "IA"
                        : "Humano"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Unread Toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Lectura</label>
            <button
              onClick={() => setDraftUnreadOnly(!draftUnreadOnly)}
              className={`w-full text-xs py-2 px-3 rounded border transition-colors ${
                draftUnreadOnly
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              Solo sin leer
            </button>
          </div>

          {/* Labels */}
          {data?.allLabels && data.allLabels.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Etiqueta</label>
              <Select value={draftLabel} onValueChange={(value) => setDraftLabel(value || "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una etiqueta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {data.allLabels.map((lbl) => (
                    <SelectItem key={lbl.id} value={lbl.id}>
                      <span
                        className="inline-block w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: lbl.color }}
                      />
                      {lbl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </FilterDialog>
      </div>

      {/* Conversations List */}
      {data.conversations.length === 0 ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground text-center">
              {q ? "No hay conversaciones" : "Tu inbox está vacío"}
            </p>
          </Card>
        </div>
      ) : (
        <VirtualizedConversationList
          conversations={data.conversations}
          data={data}
          activeConvId={activeConvId}
          searchParams={searchParams}
          parentRef={parentRef}
        />
      )}
    </div>
  );
}
