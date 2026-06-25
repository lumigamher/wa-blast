"use client";

import { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";
import { messages as messagesSchema } from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { Thread, type ReplyTarget } from "./thread";
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

type Sticker = {
  id: string;
  assetId: string;
};

type Note = {
  id: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

type Call = {
  id: string;
  direction: "in" | "out";
  status: string;
  durationSec: number | null;
  createdAt: Date;
};

export function ThreadAndComposer({
  conversationId,
  messages,
  windowOpen,
  templates,
  quickReplies,
  stickers = [],
  reactions = {},
  notes = [],
  quotes = {},
  calls = [],
  agentTyping = false,
}: {
  conversationId: string;
  messages: Message[];
  windowOpen: boolean;
  templates: Template[];
  quickReplies: QuickReply[];
  stickers?: Sticker[];
  reactions?: Record<string, { direction: "in" | "out"; emoji: string }[]>;
  notes?: Note[];
  quotes?: Record<string, { label: string; direction: "in" | "out" }>;
  calls?: Call[];
  agentTyping?: boolean;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length, notes.length, calls.length]);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <Thread messages={messages} onReplyTo={setReplyTo} reactions={reactions} notes={notes} quotes={quotes} calls={calls} />
        {agentTyping && (
          <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
            <Bot className="size-3.5 animate-pulse" />
            <span className="italic">escribiendo…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer
        conversationId={conversationId}
        windowOpen={windowOpen}
        templates={templates}
        quickReplies={quickReplies}
        stickers={stickers}
        replyTo={replyTo}
        onReplyToChange={setReplyTo}
      />
    </>
  );
}
