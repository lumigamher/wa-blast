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
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.ceil((startOfToday.getTime() - date.getTime()) / 86_400_000);
  if (daysAgo <= 1) return "ayer";
  if (daysAgo < 7) return `${daysAgo} d`;
  return date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
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
    estimateSize: () => 80,
    overscan: 15,
    measureElement: typeof window !== 'undefined'
      ? (element) => element?.getBoundingClientRect().height
      : undefined,
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
              ref={(el) => {
                if (el) {
                  rowVirtualizer.measureElement(el);
                }
              }}
              data-index={virtualItem.index}
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
              <div className="flex items-start gap-2.5">
                <ContactAvatar
                  seed={conv.phone}
                  name={conv.contactName}
                  size={40}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div
                      className={`flex-1 truncate text-sm ${
                        conv.unreadCount > 0 ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {conv.contactName || conv.phone}
                    </div>
                    {data.agentEnabled && (
                      <AgentBadge
                        agentEnabled={data.agentEnabled}
                        agentPaused={conv.agentPaused}
                      />
                    )}
                    <span
                      className={`shrink-0 text-[11px] tabular-nums ${
                        conv.unreadCount > 0
                          ? "font-medium text-emerald-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatRelativeTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div
                      className={`flex-1 truncate text-xs ${
                        conv.unreadCount > 0
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {conv.previewDirection === "out" && conv.preview && (
                        <span className="text-muted-foreground">Tú: </span>
                      )}
                      {conv.preview || "(sin mensaje)"}
                    </div>
                    {conv.status === "resolved" && (
                      <div className="shrink-0" title="Resuelta">
                        <Check className="size-3 text-muted-foreground" />
                      </div>
                    )}
                    {conv.unreadCount > 0 && (
                      <div className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                        {conv.unreadCount}
                      </div>
                    )}
                  </div>
                  {conv.labels.length > 0 && (
                    <div className="mt-1">
                      <LabelChips labels={conv.labels} />
                    </div>
                  )}
                </div>
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

  // Draft state for filter modal (estado vive fuera, en los tabs)
  const [draftAgent, setDraftAgent] = useState(agent || "all");
  const [draftUnreadOnly, setDraftUnreadOnly] = useState(unreadOnly === "true");
  const [draftLabel, setDraftLabel] = useState(label || "");

  // Reset draft when dialog opens
  const resetDraft = () => {
    setDraftAgent(agent || "all");
    setDraftUnreadOnly(unreadOnly === "true");
    setDraftLabel(label || "");
  };

  // Cambio de estado instantáneo desde los tabs (conserva el resto de filtros)
  const setStatusFilter = (value: "open" | "resolved" | "all") => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "open") params.delete("status");
    else params.set("status", value);
    router.replace(`/inbox${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
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
    data?.agentEnabled && agent ? 1 : 0,
    unreadOnly === "true" ? 1 : 0,
    label ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Apply filters to draft state and close dialog
  const applyFilters = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);

    // Status: lo controlan los tabs; se conserva tal cual está en la URL
    if (status && status !== "open") {
      params.set("status", status);
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
    setDraftAgent("all");
    setDraftUnreadOnly(false);
    setDraftLabel("");
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status && status !== "open") params.set("status", status);
    router.replace(`/inbox${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
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

      {/* Estado (tabs, aplican al instante) + Filtros */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              ["open", "Abiertas"],
              ["resolved", "Resueltas"],
              ["all", "Todas"],
            ] as const
          ).map(([value, text]) => {
            const current = status ?? "open";
            const active = current === value;
            return (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`flex-1 rounded-md py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {text}
              </button>
            );
          })}
        </div>
        <FilterDialog
          compact
          activeCount={activeFilterCount}
          onOpen={resetDraft}
          onApply={applyFilters}
          onClear={clearFilters}
        >
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
