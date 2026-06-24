import { requireModuleAccess } from "@/lib/billing/require-module";
import { Check, MessageSquareIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listConversations } from "@/lib/inbox/store";
import { getAgentConfig } from "@/lib/agent/config";
import { listLabels, labelsByConversation } from "@/lib/inbox/labels";
import { Poller } from "./_components/poller";
import { ContactAvatar } from "./[id]/_components/contact-avatar";
import { AgentBadge } from "./_components/agent-badge";
import { LabelChips } from "./_components/label-chips";

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
  searchParams: Promise<{
    q?: string;
    unreadOnly?: string;
    status?: string;
    agent?: string;
    label?: string;
  }>;
}) {
  await requireModuleAccess("inbox");
  const { q, unreadOnly, status, agent, label } = await searchParams;
  const { orgId } = await requireOrg();

  const agentConfig = await getAgentConfig(db, orgId);
  const allLabels = await listLabels(db, orgId);

  const conversations = await listConversations(db, orgId, {
    q: q ?? undefined,
    unreadOnly: unreadOnly === "true",
    status: (status as "open" | "resolved" | "all" | undefined) ?? undefined,
    agent: (agent as "ia" | "humano" | "all" | undefined) ?? undefined,
    labelId: label ?? undefined,
  });

  const labelMap = await labelsByConversation(
    db,
    orgId,
    conversations.map((c) => c.id),
  );

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
              href={`/inbox${q ? `?q=${encodeURIComponent(q)}` : ""}${unreadOnly === "true" ? (q ? "&" : "?") + "unreadOnly=true" : ""}${agent ? (q || unreadOnly === "true" ? "&" : "?") + `agent=${agent}` : ""}${label ? (q || unreadOnly === "true" || agent ? "&" : "?") + `label=${label}` : ""}`}
              className={`text-xs px-3 py-1 rounded-l-full border transition-colors ${
                !status || status === "open"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              Abiertas
            </Link>
            <Link
              href={`/inbox?status=resolved${q ? `&q=${encodeURIComponent(q)}` : ""}${unreadOnly === "true" ? "&unreadOnly=true" : ""}${agent ? `&agent=${agent}` : ""}${label ? `&label=${label}` : ""}`}
              className={`text-xs px-3 py-1 border-y transition-colors ${
                status === "resolved"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              Resueltas
            </Link>
            <Link
              href={`/inbox?status=all${q ? `&q=${encodeURIComponent(q)}` : ""}${unreadOnly === "true" ? "&unreadOnly=true" : ""}${agent ? `&agent=${agent}` : ""}${label ? `&label=${label}` : ""}`}
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
          {agentConfig.enabled && (
            <div className="flex items-center gap-1">
              <Link
                href={`/inbox${q ? `?q=${encodeURIComponent(q)}` : ""}${status ? (q ? "&" : "?") + `status=${status}` : ""}${unreadOnly === "true" ? (q || status ? "&" : "?") + "unreadOnly=true" : ""}${label ? (q || status || unreadOnly === "true" ? "&" : "?") + `label=${label}` : ""}`}
                className={`text-xs px-3 py-1 rounded-l-full border transition-colors ${
                  !agent || agent === "all"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                Todos
              </Link>
              <Link
                href={`/inbox?agent=ia${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}${unreadOnly === "true" ? "&unreadOnly=true" : ""}${label ? `&label=${label}` : ""}`}
                className={`text-xs px-3 py-1 border-y transition-colors ${
                  agent === "ia"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                🤖 IA
              </Link>
              <Link
                href={`/inbox?agent=humano${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}${unreadOnly === "true" ? "&unreadOnly=true" : ""}${label ? `&label=${label}` : ""}`}
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

          {/* Label Filter */}
          {allLabels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Etiquetas:</span>
              <Link
                href={`/inbox${q ? `?q=${encodeURIComponent(q)}` : ""}${status ? (q ? "&" : "?") + `status=${status}` : ""}${unreadOnly === "true" ? (q || status ? "&" : "?") + "unreadOnly=true" : ""}${agent ? (q || status || unreadOnly === "true" ? "&" : "?") + `agent=${agent}` : ""}`}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  !label
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                Todas
              </Link>
              {allLabels.map((lbl) => (
                <Link
                  key={lbl.id}
                  href={`/inbox?label=${lbl.id}${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}${unreadOnly === "true" ? "&unreadOnly=true" : ""}${agent ? `&agent=${agent}` : ""}`}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors text-white ${
                    label === lbl.id
                      ? "border-border"
                      : "border-border hover:opacity-80"
                  }`}
                  style={{
                    backgroundColor: label === lbl.id ? lbl.color : lbl.color,
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
                if (agent) params.set("agent", agent);
                if (label) params.set("label", label);
                const href = `/inbox/${conv.id}${params.toString() ? `?${params.toString()}` : ""}`;

                const convLabels = labelMap[conv.id] ?? [];

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
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="text-sm font-medium truncate">
                              {conv.contactName || conv.phone}
                            </div>
                            {agentConfig.enabled && (
                              <AgentBadge
                                agentEnabled={agentConfig.enabled}
                                agentPaused={conv.agentPaused}
                              />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {conv.preview || "(sin mensaje)"}
                          </div>
                          {convLabels.length > 0 && (
                            <div className="mt-1.5">
                              <LabelChips labels={convLabels} />
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
