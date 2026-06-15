import { SearchIcon } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getThread, listConversations, markConversationRead } from "@/lib/inbox/store";
import { isWindowOpen } from "@/lib/inbox/window";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings, listTemplates } from "@/lib/meta/graph";
import { extractVariables } from "@/lib/templates";
import { listQuickReplies } from "@/lib/inbox/quick-replies";
import type { WhatsAppTemplate } from "@/lib/meta/types";
import { ThreadAndComposer } from "./_components/thread-and-composer";
import { MarkReadOnOpen } from "./_components/mark-read-on-open";
import { Poller } from "../_components/poller";

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

export default async function InboxThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; unreadOnly?: string }>;
}) {
  const { id: conversationId } = await params;
  const { q, unreadOnly } = await searchParams;
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
  });

  // Get approved templates
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  const allTemplates = creds
    ? await listTemplates(creds).catch(() => [])
    : [];
  const approvedTemplates = allTemplates
    .filter((t: WhatsAppTemplate) => t.status === "APPROVED")
    .map((t: WhatsAppTemplate) => ({
      name: t.name,
      language: t.language,
      bodyText: (t.components.find((c) => c.type === "BODY")?.text ?? "").substring(0, 100),
      varCount: extractVariables(t).length,
    }));

  // Get quick replies
  const quickReplies = await listQuickReplies(db, orgId);

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
                <a
                  key={conv.id}
                  href={`/inbox/${conv.id}${unreadOnly === "true" ? "?unreadOnly=true" : ""}`}
                  className={`block p-3 rounded-md border transition-colors ${
                    conv.id === conversationId
                      ? "bg-accent border-primary"
                      : "hover:bg-muted/50 border-transparent hover:border-border"
                  }`}
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
                </a>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Thread */}
        <div className="flex min-h-0 flex-col border rounded-lg bg-card overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">
                  {thread.contact?.name || thread.conversation.phone}
                </div>
                <div className="text-xs text-muted-foreground">
                  {thread.conversation.phone}
                </div>
              </div>
              <div className="text-xs px-2.5 py-1 rounded-full bg-muted border">
                {windowOpen ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Ventana abierta
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    Ventana cerrada
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Messages and Composer */}
          <ThreadAndComposer
            conversationId={conversationId}
            messages={thread.messages}
            windowOpen={windowOpen}
            templates={approvedTemplates}
            quickReplies={quickReplies}
          />
        </div>
      </div>

      <MarkReadOnOpen conversationId={conversationId} />
      <Poller />
    </div>
  );
}
