"use client";

import { useState, useRef, useEffect } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  CheckCheckIcon,
  FileIcon,
  SmilePlusIcon,
  StickyNoteIcon,
} from "lucide-react";
import { messages as messagesSchema } from "@/lib/db/schema";
import { sendReactionAction } from "../../actions";
import type { InferSelectModel } from "drizzle-orm";
import { AudioPlayer } from "./audio-player";
import { EmojiPicker } from "./emoji-picker";
import { ReactionChips } from "./reaction-chip";
import { MediaImage } from "./media-image";

type Message = InferSelectModel<typeof messagesSchema>;

export type ReplyTarget = {
  wamid: string;
  label: string;
  author: "in" | "out";
};

type Note = {
  id: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

type TimelineItem =
  | { kind: "message"; at: Date; msg: Message }
  | { kind: "note"; at: Date; note: Note };

type ThreadProps = {
  messages: Message[];
  onReplyTo: (target: ReplyTarget) => void;
  reactions: Record<string, { direction: "in" | "out"; emoji: string }[]>;
  notes?: Note[];
  quotes?: Record<string, { label: string; direction: "in" | "out" }>;
};

function replyLabel(message: Message): string {
  switch (message.type) {
    case "text":
      return (message.body || "").slice(0, 80);
    case "image":
      return "📷 Imagen";
    case "video":
      return "🎬 Video";
    case "audio":
      return "🎤 Nota de voz";
    case "sticker":
      return "🩹 Sticker";
    case "document":
      return message.body || "📄 Documento";
    case "template":
      return "Plantilla";
    case "interactive":
    case "button":
    case "flow":
      return (message.body || "").slice(0, 80);
    default:
      return (message.body || "").slice(0, 80) || `[${message.type}]`;
  }
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return "Hoy";
  }

  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Ayer";
  }

  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
  });
}

export function Thread({ messages, onReplyTo, reactions, notes = [], quotes = {} }: ThreadProps) {
  // Filter out legacy standalone reaction messages
  const visible = messages.filter((m) => m.type !== "reaction");

  // Build merged, time-sorted timeline of messages and notes
  const timeline: TimelineItem[] = [
    ...visible.map((msg) => ({ kind: "message" as const, at: msg.createdAt, msg })),
    ...notes.map((note) => ({ kind: "note" as const, at: note.createdAt, note })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No hay mensajes aún</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {timeline.map((item, idx) => {
        const prevItem = idx > 0 ? timeline[idx - 1] : null;
        const currentDay = new Date(item.at);
        const prevDay = prevItem ? new Date(prevItem.at) : null;

        const isDifferentDay =
          !prevDay ||
          currentDay.getFullYear() !== prevDay.getFullYear() ||
          currentDay.getMonth() !== prevDay.getMonth() ||
          currentDay.getDate() !== prevDay.getDate();

        return (
          <div key={`${item.kind}-${item.kind === "message" ? item.msg.id : item.note.id}`}>
            {isDifferentDay && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {dayLabel(currentDay)}
                </span>
              </div>
            )}
            {item.kind === "message" ? (
              <MessageBubble
                message={item.msg}
                onReplyTo={onReplyTo}
                reactions={reactions[item.msg.wamid ?? ""] ?? []}
                quote={quotes[item.msg.id]}
              />
            ) : (
              <NoteBubble note={item.note} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({
  message,
  onReplyTo,
  reactions,
  quote,
}: {
  message: Message;
  onReplyTo: (target: ReplyTarget) => void;
  reactions: { direction: "in" | "out"; emoji: string }[];
  quote?: { label: string; direction: "in" | "out" };
}) {
  const [showReactionPopover, setShowReactionPopover] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [reactionsLoading, setReactionsLoading] = useState(false);
  const isOutbound = message.direction === "out";
  const time = message.createdAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const quickEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleReaction = async (emoji: string) => {
    if (!message.wamid || isOutbound) return;
    setReactionsLoading(true);
    try {
      await sendReactionAction(message.conversationId, { wamid: message.wamid, emoji });
    } finally {
      setReactionsLoading(false);
      setShowReactionPopover(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isOutbound && message.wamid) {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const bubbleContent = renderMessageContent(message);

  // Special case: stickers don't have colored background
  if (message.type === "sticker") {
    return (
      <div
        className={`flex gap-2 group relative ${
          isOutbound ? "flex-row-reverse justify-start" : "flex-row"
        }`}
        onContextMenu={handleContextMenu}
      >
        <div className="relative">
          {/* Bubble with toolbar anchored to top */}
          <div className="relative inline-block">
            {bubbleContent}

            {/* Hover action toolbar - anchored to bubble, inner side */}
            {!isOutbound && message.wamid && (
              <div className={`absolute top-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
                isOutbound ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"
              }`}>
                <div className="flex items-center gap-0.5 rounded-full border bg-background px-1 py-0.5 shadow-sm">
                  <button
                    onClick={() => {
                      if (message.wamid) {
                        onReplyTo({
                          wamid: message.wamid,
                          label: replyLabel(message),
                          author: message.direction,
                        });
                      }
                    }}
                    className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Responder"
                    aria-label="Responder"
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="21 15 16 10 21 5"></polyline>
                      <path d="M21 15H9a6 6 0 0 0-6 6v0a6 6 0 0 0 6 6h12"></path>
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowReactionPopover(!showReactionPopover)}
                    className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Reaccionar"
                    aria-label="Reaccionar"
                  >
                    <SmilePlusIcon className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Reaction popover - anchored to bubble, not floating to viewport */}
            {!isOutbound && message.wamid && showReactionPopover && (
              <div className="absolute top-full mt-2 left-0 z-30 bg-white dark:bg-slate-800 border border-muted rounded-lg shadow-lg p-2 flex flex-col gap-1 min-w-max">
                <div className="flex gap-1">
                  {quickEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      disabled={reactionsLoading}
                      className="text-lg hover:scale-110 transition-transform disabled:opacity-50 p-1 rounded hover:bg-muted"
                      title={`Reaccionar con ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                  <div className="flex items-center">
                    <EmojiPicker
                      onPick={(emoji) => handleReaction(emoji)}
                      disabled={reactionsLoading}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Reaction chips - below bubble, no overlap */}
          {reactions.length > 0 && (
            <div className={`mt-1 flex gap-0.5 ${isOutbound ? "justify-end" : "justify-start"}`}>
              <ReactionChips reactions={reactions} />
            </div>
          )}
        </div>

        {/* Right-click context menu */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-white dark:bg-slate-800 border border-muted rounded-md shadow-lg overflow-hidden"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
          >
            <button
              onClick={() => {
                if (message.wamid) {
                  onReplyTo({
                    wamid: message.wamid,
                    label: replyLabel(message),
                    author: message.direction,
                  });
                }
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
            >
              Responder
            </button>
            <button
              onClick={() => {
                setShowReactionPopover(true);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors border-t border-muted"
            >
              Reaccionar
            </button>
          </div>
        )}
      </div>
    );
  }

  // Regular messages with colored background
  const bubbleWidthClass = message.type === "audio" ? "w-64" : "max-w-xs";

  return (
    <div
      className={`flex gap-2 group relative ${
        isOutbound ? "flex-row-reverse justify-start" : "flex-row"
      }`}
      onContextMenu={handleContextMenu}
    >
      <div className="relative">
        {/* Bubble with toolbar anchored to top */}
        <div className="relative inline-block">
          <div
            className={`${bubbleWidthClass} rounded-lg px-3 py-2 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
              isOutbound
                ? "bg-emerald-100 dark:bg-emerald-900 text-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {quote && (
              <div className="border-l-2 border-emerald-500/60 bg-black/5 dark:bg-white/5 rounded px-2 py-1 mb-1">
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {quote.label}
                </p>
              </div>
            )}
            <div className={`text-sm ${message.type !== "audio" ? "whitespace-pre-wrap break-words" : ""}`}>
              {bubbleContent}
            </div>

            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {time}
              </span>
              {isOutbound && (
                <StatusIcon status={message.status} errorMessage={message.errorMessage} />
              )}
            </div>
          </div>

          {/* Hover action toolbar - anchored to bubble, inner side */}
          {!isOutbound && message.wamid && (
            <div className={`absolute top-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
              isOutbound ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"
            }`}>
              <div className="flex items-center gap-0.5 rounded-full border bg-background px-1 py-0.5 shadow-sm">
                <button
                  onClick={() => {
                    if (message.wamid) {
                      onReplyTo({
                        wamid: message.wamid,
                        label: replyLabel(message),
                        author: message.direction,
                      });
                    }
                  }}
                  className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Responder"
                  aria-label="Responder"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 15 16 10 21 5"></polyline>
                    <path d="M21 15H9a6 6 0 0 0-6 6v0a6 6 0 0 0 6 6h12"></path>
                  </svg>
                </button>
                <button
                  onClick={() => setShowReactionPopover(!showReactionPopover)}
                  className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Reaccionar"
                  aria-label="Reaccionar"
                >
                  <SmilePlusIcon className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* Reaction popover - anchored to bubble, not floating to viewport */}
          {!isOutbound && message.wamid && showReactionPopover && (
            <div className="absolute top-full mt-2 left-0 z-30 bg-white dark:bg-slate-800 border border-muted rounded-lg shadow-lg p-2 flex flex-col gap-1 min-w-max">
              <div className="flex gap-1">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    disabled={reactionsLoading}
                    className="text-lg hover:scale-110 transition-transform disabled:opacity-50 p-1 rounded hover:bg-muted"
                    title={`Reaccionar con ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                <div className="flex items-center">
                  <EmojiPicker
                    onPick={(emoji) => handleReaction(emoji)}
                    disabled={reactionsLoading}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Reaction chips - below bubble, no overlap with timestamp */}
        {reactions.length > 0 && (
          <div className={`mt-1 flex gap-0.5 ${isOutbound ? "justify-end" : "justify-start"}`}>
            <ReactionChips reactions={reactions} />
          </div>
        )}
      </div>

      {isOutbound && message.status === "failed" && message.errorMessage && (
        <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
          <span title={message.errorMessage}>
            <AlertCircleIcon className="size-3" />
          </span>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-slate-800 border border-muted rounded-md shadow-lg overflow-hidden"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={() => {
              if (message.wamid) {
                onReplyTo({
                  wamid: message.wamid,
                  label: replyLabel(message),
                  author: message.direction,
                });
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
          >
            Responder
          </button>
          <button
            onClick={() => {
              setShowReactionPopover(true);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors border-t border-muted"
          >
            Reaccionar
          </button>
        </div>
      )}
    </div>
  );
}

function StatusIcon({
  status,
  errorMessage,
}: {
  status: string | null;
  errorMessage: string | null;
}) {
  if (status === "failed") {
    return (
      <span title={errorMessage || "Error al enviar"}>
        <AlertCircleIcon className="size-3.5 text-red-600 dark:text-red-400" />
      </span>
    );
  }
  if (status === "read") {
    return <CheckCheckIcon className="size-3.5 text-blue-600 dark:text-blue-400" />;
  }
  if (status === "delivered") {
    return <CheckCheckIcon className="size-3.5 text-muted-foreground" />;
  }
  if (status === "sent" || status === "pending") {
    return <CheckIcon className="size-3.5 text-muted-foreground" />;
  }
  return null;
}

function NoteBubble({ note }: { note: Note }) {
  const time = note.createdAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="my-1 flex justify-center">
      <div className="max-w-[80%] rounded-lg bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <StickyNoteIcon className="size-3" />
          Nota interna · {note.authorName}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm text-foreground/90">
          {note.body}
        </div>
        <div className="mt-1 text-right text-[10px] text-amber-700/70 dark:text-amber-500/60">
          {time}
        </div>
      </div>
    </div>
  );
}

function renderMessageContent(message: Message): React.ReactNode {
  switch (message.type) {
    case "text":
      return message.body;

    case "image":
      return message.mediaId ? (
        <div className="space-y-2">
          <MediaImage
            src={`/api/inbox/media/${message.mediaId}`}
            alt="Image"
          />
          {message.body && <div className="text-xs">{message.body}</div>}
        </div>
      ) : (
        `[Imagen]`
      );

    case "video":
      return message.mediaId ? (
        <div className="space-y-2">
          <video
            src={`/api/inbox/media/${message.mediaId}`}
            controls
            className="max-h-80 max-w-sm rounded-lg border border-black/5 object-cover"
          />
          {message.body && <div className="text-xs">{message.body}</div>}
        </div>
      ) : (
        `[Video]`
      );

    case "audio":
      return message.mediaId ? (
        <AudioPlayer src={`/api/inbox/media/${message.mediaId}`} />
      ) : (
        `[Audio]`
      );

    case "document":
      return (
        <a
          href={message.mediaId ? `/api/inbox/media/${message.mediaId}` : "#"}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
        >
          <FileIcon className="size-4" />
          {message.body || "Documento"}
        </a>
      );

    case "sticker":
      return message.mediaId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/inbox/media/${message.mediaId}`}
          alt="Sticker"
          className="size-32 object-contain"
        />
      ) : (
        `[Sticker]`
      );

    case "interactive":
      return (
        <div>
          <div className="text-sm">{message.body}</div>
          {message.payloadJson && (
            <div className="text-xs text-muted-foreground mt-1 opacity-75">
              [Respuesta interactiva]
            </div>
          )}
        </div>
      );

    case "button":
      return (
        <div>
          <div className="text-sm font-medium">{message.body}</div>
          <div className="text-xs text-muted-foreground mt-1 opacity-75">
            [Presionó botón]
          </div>
        </div>
      );

    case "flow":
      return (
        <div>
          <div className="text-sm">{message.body}</div>
          {message.payloadJson && (
            <div className="text-xs text-muted-foreground mt-1 opacity-75">
              [Formulario completado]
            </div>
          )}
        </div>
      );

    case "template":
      return (
        <div className="text-sm italic">
          {message.body}
        </div>
      );

    case "reaction":
      return <span className="text-2xl">{message.body}</span>;

    case "unknown":
    default:
      return `[Mensaje no soportado: ${message.type}]`;
  }
}
