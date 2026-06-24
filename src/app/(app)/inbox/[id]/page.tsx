import { requireModuleAccess } from "@/lib/billing/require-module";
import { Check, SearchIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listNotes } from "@/lib/inbox/notes";
import { listQuickReplies } from "@/lib/inbox/quick-replies";
import { listStickers } from "@/lib/inbox/stickers";
import {
  getThread,
  listConversations,
  markConversationRead,
} from "@/lib/inbox/store";
import { isWindowOpen } from "@/lib/inbox/window";
import { credsFromSettings, listTemplates } from "@/lib/meta/graph";
import type { WhatsAppTemplate } from "@/lib/meta/types";
import { getOrgSettings } from "@/lib/org/settings";
import { extractVariables } from "@/lib/templates";
import { getAgentConfig } from "@/lib/agent/config";
import { getConversationLabels, listLabels } from "@/lib/inbox/labels";
import { Poller } from "../_components/poller";
import { ContactAvatar } from "./_components/contact-avatar";
import { ContactInfoToggle } from "./_components/contact-panel";
import { ConversationSearch } from "./_components/conversation-search";
import { MarkReadOnOpen } from "./_components/mark-read-on-open";
import { ResolveButton } from "./_components/resolve-button";
import { ThreadAndComposer } from "./_components/thread-and-composer";
import { AgentBadge } from "../_components/agent-badge";
import { LabelChips } from "../_components/label-chips";
import { AgentControls } from "./_components/agent-controls";
import { LabelPopover } from "./_components/label-popover";

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

export default async function InboxThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; unreadOnly?: string; status?: string }>;
}) {
  await requireModuleAccess("inbox");
  const { id: conversationId } = await params;
  const { q, unreadOnly, status } = await searchParams;
  const { orgId } = await requireOrg();

  // Get thread or 404
  const thread = await getThread(db, orgId, conversationId);
  if (!thread) notFound();

  // Mark as read server-side
  await markConversationRead(db, orgId, conversationId);

  // Get conversation list for sidebar
  const conversations = await listConversations(db, orgId, {
    q: q ?? undefined,
    unreadOnly: unreadOnly === "true",
    status: (status as "open" | "resolved" | "all" | undefined) ?? undefined,
  });

  // Get approved templates
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  const allTemplates = creds ? await listTemplates(creds).catch(() => []) : [];
  const approvedTemplates = allTemplates
    .filter((t: WhatsAppTemplate) => t.status === "APPROVED")
    .map((t: WhatsAppTemplate) => ({
      name: t.name,
      language: t.language,
      bodyText: (
        t.components.find((c) => c.type === "BODY")?.text ?? ""
      ).substring(0, 100),
      varCount: extractVariables(t).length,
    }));

  // Get agent config and labels
  const agentConfig = await getAgentConfig(db, orgId);
  const allLabels = await listLabels(db, orgId);
  const currentLabels = await getConversationLabels(db, orgId, conversationId);

  // Get quick replies
  const quickReplies = await listQuickReplies(db, orgId);

  // Get stickers
  const stickers = await listStickers(db, orgId);

  // Notes are now fetched in getThread, but we keep this for the contact panel
  const contactPanelNotes = await listNotes(db, orgId, conversationId);

  const windowOpen = isWindowOpen(thread.conversation.lastIncomingAt);

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
                  <a
                    key={conv.id}
                    href={href}
                    className={`block p-3 rounded-md border transition-colors ${
                      conv.id === conversationId
                        ? "bg-accent border-primary"
                        : "hover:bg-muted/50 border-transparent hover:border-border"
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
                  </a>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Thread */}
        <div className="relative flex min-h-0 flex-col border rounded-lg bg-card overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <ContactAvatar
                  seed={thread.conversation.phone}
                  name={thread.contact?.name}
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="font-semibold text-sm truncate">
                      {thread.contact?.name || thread.conversation.phone}
                    </div>
                    {agentConfig.enabled && (
                      <AgentBadge
                        agentEnabled={agentConfig.enabled}
                        agentPaused={thread.conversation.agentPaused}
                      />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    WhatsApp · {thread.conversation.phone}
                  </div>
                  {currentLabels.length > 0 && (
                    <div className="mt-1.5">
                      <LabelChips labels={currentLabels} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                <ConversationSearch />
                <div className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs whitespace-nowrap">
                  <span
                    className={`size-1.5 rounded-full ${
                      windowOpen ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    aria-hidden
                  />
                  <span
                    className={
                      windowOpen
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    }
                  >
                    {windowOpen ? "Ventana abierta" : "Ventana cerrada"}
                  </span>
                </div>
                <ResolveButton
                  conversationId={conversationId}
                  resolved={thread.conversation.status === "resolved"}
                />
                {allLabels.length > 0 && (
                  <LabelPopover
                    conversationId={conversationId}
                    allLabels={allLabels}
                    currentLabelIds={currentLabels.map((l) => l.id)}
                  />
                )}
                <ContactInfoToggle
                  conversationId={conversationId}
                  contact={thread.contact}
                  contactId={thread.contact?.id ?? null}
                  phone={thread.conversation.phone}
                  notes={contactPanelNotes}
                />
              </div>
            </div>

            {/* Agent Controls */}
            {agentConfig.enabled && (
              <AgentControls
                conversationId={conversationId}
                agentEnabled={agentConfig.enabled}
                agentPaused={thread.conversation.agentPaused}
              />
            )}
          </div>

          {/* Messages and Composer */}
          <ThreadAndComposer
            conversationId={conversationId}
            messages={thread.messages}
            windowOpen={windowOpen}
            templates={approvedTemplates}
            quickReplies={quickReplies}
            stickers={stickers}
            reactions={thread.reactions}
            notes={thread.notes}
            quotes={thread.quotes}
            calls={thread.calls}
          />
        </div>
      </div>

      <MarkReadOnOpen conversationId={conversationId} />
      <Poller />
    </div>
  );
}
