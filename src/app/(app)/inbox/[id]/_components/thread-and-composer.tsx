"use client";

import { useState } from "react";
import { messages as messagesSchema } from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { Thread } from "./thread";
import { Composer } from "./composer";

type Message = InferSelectModel<typeof messagesSchema>;

type QuickReply = {
  id: string;
  shortcut: string;
  body: string;
};

type Template = {
  name: string;
  language: string;
  bodyText: string;
  varCount: number;
};

export function ThreadAndComposer({
  conversationId,
  messages,
  windowOpen,
  templates,
  quickReplies,
}: {
  conversationId: string;
  messages: Message[];
  windowOpen: boolean;
  templates: Template[];
  quickReplies: QuickReply[];
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <Thread messages={messages} onReplyTo={setReplyTo} />
      </div>

      <Composer
        conversationId={conversationId}
        windowOpen={windowOpen}
        templates={templates}
        quickReplies={quickReplies}
        replyTo={replyTo}
        onReplyToChange={setReplyTo}
      />
    </>
  );
}
