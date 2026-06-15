"use client";

import { useEffect, useRef, useState } from "react";
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
  reactions = {},
}: {
  conversationId: string;
  messages: Message[];
  windowOpen: boolean;
  templates: Template[];
  quickReplies: QuickReply[];
  reactions?: Record<string, { direction: "in" | "out"; emoji: string }[]>;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <Thread messages={messages} onReplyTo={setReplyTo} reactions={reactions} />
        <div ref={bottomRef} />
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
