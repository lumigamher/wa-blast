import { requireModuleAccess } from "@/lib/billing/require-module";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listNotes } from "@/lib/inbox/notes";
import { listQuickReplies } from "@/lib/inbox/quick-replies";
import { listStickers } from "@/lib/inbox/stickers";
import {
  getThread,
  markConversationRead,
} from "@/lib/inbox/store";
import { isWindowOpen } from "@/lib/inbox/window";
import { credsFromSettings, listTemplates } from "@/lib/meta/graph";
import type { WhatsAppTemplate } from "@/lib/meta/types";
import { getOrgSettings } from "@/lib/org/settings";
import { extractVariables } from "@/lib/templates";
import { getAgentConfig } from "@/lib/agent/config";
import { getConversationLabels, listLabels } from "@/lib/inbox/labels";
import { Poller } from "../../_components/poller";
import { ContactAvatar } from "./_components/contact-avatar";
import { ContactInfoToggle } from "./_components/contact-panel";
import { ConversationSearch } from "./_components/conversation-search";
import { MarkReadOnOpen } from "./_components/mark-read-on-open";
import { MobileBackButton } from "./_components/mobile-back-button";
import { ResolveButton } from "./_components/resolve-button";
import { ThreadAndComposer } from "./_components/thread-and-composer";
import { AgentBadge } from "../../_components/agent-badge";
import { LabelChips } from "../../_components/label-chips";
import { AgentControls } from "./_components/agent-controls";
import { LabelPopover } from "./_components/label-popover";

export const dynamic = "force-dynamic";

export default async function InboxThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("inbox");
  const { id: conversationId } = await params;
  const { orgId } = await requireOrg();

  // Get thread or 404
  const thread = await getThread(db, orgId, conversationId);
  if (!thread) notFound();

  // Mark as read server-side
  await markConversationRead(db, orgId, conversationId);

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
    <div className="relative flex flex-1 min-h-0 flex-col border rounded-lg bg-card overflow-hidden m-3">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <MobileBackButton />
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
          <div className="hidden md:flex items-center gap-2 ml-2 flex-shrink-0">
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
            {agentConfig.enabled && (
              <AgentControls
                conversationId={conversationId}
                agentEnabled={agentConfig.enabled}
                agentPaused={thread.conversation.agentPaused}
              />
            )}
            <ResolveButton
              conversationId={conversationId}
              resolved={thread.conversation.status === "resolved"}
            />
            <LabelPopover
              conversationId={conversationId}
              allLabels={allLabels}
              currentLabelIds={currentLabels.map((l) => l.id)}
            />
            <ContactInfoToggle
              conversationId={conversationId}
              contact={thread.contact}
              contactId={thread.contact?.id ?? null}
              phone={thread.conversation.phone}
              notes={contactPanelNotes}
            />
          </div>
          <div className="md:hidden flex items-center gap-2 ml-2 flex-shrink-0">
            <ResolveButton
              conversationId={conversationId}
              resolved={thread.conversation.status === "resolved"}
            />
            <ContactInfoToggle
              conversationId={conversationId}
              contact={thread.contact}
              contactId={thread.contact?.id ?? null}
              phone={thread.conversation.phone}
              notes={contactPanelNotes}
            />
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
        stickers={stickers}
        reactions={thread.reactions}
        notes={thread.notes}
        quotes={thread.quotes}
        calls={thread.calls}
      />

      <MarkReadOnOpen conversationId={conversationId} />
      <Poller />
    </div>
  );
}
