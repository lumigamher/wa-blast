"use client";

import type { InferSelectModel } from "drizzle-orm";
import {
  AlertCircleIcon,
  CheckCheckIcon,
  CheckIcon,
  ClipboardListIcon,
  DownloadIcon,
  FileIcon,
  LinkIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  PhoneIcon,
  ReplyIcon,
  SmilePlusIcon,
  StickyNoteIcon,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { messages as messagesSchema } from "@/lib/db/schema";
import { sendReactionAction } from "../../../actions";
import { AudioPlayer } from "./audio-player";
import { explainMetaError } from "@/lib/meta/error-explain";
import { CallEntry } from "./call-entry";
import { EmojiPicker } from "./emoji-picker";
import { MediaImage } from "./media-image";
import { MediaVideo } from "./media-video";
import { ReactionChips } from "./reaction-chip";

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

type Call = {
  id: string;
  direction: "in" | "out";
  status: string;
  durationSec: number | null;
  createdAt: Date;
};

type TimelineItem =
  | { kind: "message"; at: Date; msg: Message }
  | { kind: "note"; at: Date; note: Note }
  | { kind: "call"; at: Date; call: Call };

type ThreadProps = {
  messages: Message[];
  onReplyTo: (target: ReplyTarget) => void;
  reactions: Record<string, { direction: "in" | "out"; emoji: string }[]>;
  notes?: Note[];
  quotes?: Record<string, { label: string; direction: "in" | "out" }>;
  calls?: Call[];
};

function replyLabel(message: Message): string {
  switch (message.type) {
    case "text":
      return (message.body || "").slice(0, 80);
    case "image":
      return "Imagen";
    case "video":
      return "Video";
    case "audio":
      return "Nota de voz";
    case "sticker":
      return "Sticker";
    case "document":
      return message.body || "Documento";
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

export function Thread({
  messages,
  onReplyTo,
  reactions,
  notes = [],
  quotes = {},
  calls = [],
}: ThreadProps) {
  const [query, setQuery] = useState("");

  // La búsqueda vive en el header (ConversationSearch) y llega por evento.
  useEffect(() => {
    const onSearch = (e: Event) =>
      setQuery((e as CustomEvent<{ query: string }>).detail?.query ?? "");
    window.addEventListener("lula:thread-search", onSearch as EventListener);
    return () =>
      window.removeEventListener(
        "lula:thread-search",
        onSearch as EventListener,
      );
  }, []);

  // Filter out legacy standalone reaction messages
  const visible = messages.filter((m) => m.type !== "reaction");

  // Build merged, time-sorted timeline of messages, notes, and calls
  const timeline: TimelineItem[] = [
    ...visible.map((msg) => ({
      kind: "message" as const,
      at: msg.createdAt,
      msg,
    })),
    ...notes.map((note) => ({
      kind: "note" as const,
      at: note.createdAt,
      note,
    })),
    ...calls.map((call) => ({
      kind: "call" as const,
      at: call.createdAt,
      call,
    })),
  ]
    .filter((item) => item.at != null)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No hay mensajes aún</p>
      </div>
    );
  }

  // Búsqueda dentro de la conversación: filtra a los mensajes cuyo texto coincide
  const q = query.trim().toLowerCase();
  const items = q
    ? timeline.filter(
        (it) =>
          it.kind === "message" &&
          (it.msg.body ?? "").toLowerCase().includes(q),
      )
    : timeline;

  return (
    <div className="flex flex-col gap-3">
      {q && (
        <div className="py-1 text-center text-[11px] text-muted-foreground">
          {items.length} resultado{items.length === 1 ? "" : "s"} para “
          {query.trim()}”
        </div>
      )}
      {q && items.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sin resultados
        </p>
      )}
      {items.map((item, idx) => {
        const prevItem = idx > 0 ? items[idx - 1] : null;
        const currentDay = new Date(item.at);
        const prevDay = prevItem ? new Date(prevItem.at) : null;

        const isDifferentDay =
          !prevDay ||
          currentDay.getFullYear() !== prevDay.getFullYear() ||
          currentDay.getMonth() !== prevDay.getMonth() ||
          currentDay.getDate() !== prevDay.getDate();

        return (
          <div
            key={`${item.kind}-${item.kind === "message" ? item.msg.id : item.kind === "note" ? item.note.id : item.call.id}`}
          >
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
            ) : item.kind === "note" ? (
              <NoteBubble note={item.note} />
            ) : (
              <CallEntry call={item.call} />
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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [reactionsLoading, setReactionsLoading] = useState(false);
  const isOutbound = message.direction === "out";
  const time = message.createdAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const quickEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleReaction = async (emoji: string) => {
    if (!message.wamid || isOutbound) return;
    setReactionsLoading(true);
    try {
      const res = await sendReactionAction(message.conversationId, {
        wamid: message.wamid,
        emoji,
      });
      if (res.ok) {
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo reaccionar");
      }
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
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
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
        } ${reactions.length > 0 ? "mb-2" : ""}`}
        onContextMenu={handleContextMenu}
      >
        <div className="relative">
          {/* Bubble with toolbar anchored to top */}
          <div className="relative inline-block">
            {bubbleContent}

            {/* Hover action toolbar - anchored to bubble, inner side */}
            {!isOutbound && message.wamid && (
              <div
                className={`absolute top-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
                  isOutbound
                    ? "left-0 -translate-x-full pr-1"
                    : "right-0 translate-x-full pl-1"
                }`}
              >
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
                    <ReplyIcon className="size-4" />
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
            {/* Reacciones: chip absoluto sobre el borde inferior (no empuja el flujo) */}
            {reactions.length > 0 && (
              <div
                className={`absolute -bottom-1.5 z-10 ${isOutbound ? "right-2" : "left-2"}`}
              >
                <ReactionChips reactions={reactions} />
              </div>
            )}
          </div>
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
      } ${reactions.length > 0 ? "mb-2" : ""}`}
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
            <div
              className={`text-sm ${message.type !== "audio" ? "whitespace-pre-wrap break-words" : ""}`}
            >
              {bubbleContent}
            </div>

            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {time}
              </span>
              {isOutbound && (
                <StatusIcon
                  status={message.status}
                  errorMessage={message.errorMessage}
                />
              )}
            </div>
          </div>

          {/* Hover action toolbar - anchored to bubble, inner side */}
          {!isOutbound && message.wamid && (
            <div
              className={`absolute top-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
                isOutbound
                  ? "left-0 -translate-x-full pr-1"
                  : "right-0 translate-x-full pl-1"
              }`}
            >
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
                  <ReplyIcon className="size-4" />
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
          {/* Reacciones: chip absoluto sobre el borde inferior de la burbuja (no empuja el flujo) */}
          {reactions.length > 0 && (
            <div
              className={`absolute -bottom-1.5 z-10 ${isOutbound ? "right-2" : "left-2"}`}
            >
              <ReactionChips reactions={reactions} />
            </div>
          )}
        </div>
      </div>

      {isOutbound && message.status === "failed" && (
        <div
          className="mt-0.5 flex items-start justify-end gap-1 text-xs text-red-600 dark:text-red-400"
          title={message.errorMessage ?? undefined}
        >
          <AlertCircleIcon className="mt-0.5 size-3 shrink-0" />
          <span className="max-w-[280px] text-right leading-snug">
            {explainMetaError(message.errorMessage)}
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
      <span
        title={`${explainMetaError(errorMessage)}${errorMessage ? `\n\nDetalle técnico: ${errorMessage}` : ""}`}
      >
        <AlertCircleIcon className="size-3.5 text-red-600 dark:text-red-400" />
      </span>
    );
  }
  if (status === "read") {
    return (
      <CheckCheckIcon className="size-3.5 text-blue-600 dark:text-blue-400" />
    );
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
          <MediaImage src={`/api/inbox/media/${message.mediaId}`} alt="Image" />
          {message.body && <div className="text-xs">{message.body}</div>}
        </div>
      ) : (
        `[Imagen]`
      );

    case "video":
      return message.mediaId ? (
        <div className="space-y-2">
          <MediaVideo src={`/api/inbox/media/${message.mediaId}`} />
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
          download={message.body || "documento"}
          className="flex items-center gap-3 rounded-lg border border-black/10 dark:border-white/10 bg-background/60 px-3 py-2 transition-colors hover:bg-background"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            <FileIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {message.body || "Documento"}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DownloadIcon className="size-3" /> Descargar
            </div>
          </div>
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
      // Inbound interactive reply (button_reply or list_reply)
      if (message.direction === "in" && message.body) {
        return (
          <div className="flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-900 px-3 py-1.5 text-xs font-medium text-blue-900 dark:text-blue-100 w-fit max-w-xs">
            <MousePointerClickIcon className="size-3.5 flex-shrink-0" />
            <span className="truncate">{message.body}</span>
          </div>
        );
      }
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

    case "template": {
      if (message.payloadJson) {
        try {
          const payload = JSON.parse(message.payloadJson) as {
            kind: "template" | "carousel";
            templateName?: string;
            language?: string;
            headerType?: string;
            bodyText: string;
            buttons?: Array<{
              type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "FLOW";
              text: string;
              url?: string;
              phone_number?: string;
              flow_id?: string;
            }>;
            cards?: Array<{
              bodyText: string;
              mediaUrl?: string;
              buttons: Array<{
                type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
                text: string;
              }>;
            }>;
          };

          // Render carousel
          if (payload.kind === "carousel" && payload.cards) {
            return (
              <div className="flex flex-col gap-3">
                {payload.bodyText && (
                  <div className="text-sm font-medium">{payload.bodyText}</div>
                )}
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  {payload.cards.map((card, idx) => (
                    <div
                      key={idx}
                      className="flex-shrink-0 w-48 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-950 shadow-sm"
                    >
                      {card.mediaUrl && (
                        <div className="h-32 w-full bg-gray-100 dark:bg-gray-800 overflow-hidden rounded-t-lg">
                          <MediaImage src={card.mediaUrl} alt="Card" />
                        </div>
                      )}
                      <div className="p-3 flex flex-col gap-2">
                        {card.bodyText && (
                          <div className="text-xs line-clamp-2 leading-tight">
                            {card.bodyText}
                          </div>
                        )}
                        {card.buttons && card.buttons.length > 0 && (
                          <div className="flex flex-col gap-1 border-t border-black/10 dark:border-white/10 pt-2">
                            {card.buttons.map((btn, btnIdx) => {
                              const icon =
                                btn.type === "URL" ? (
                                  <LinkIcon className="size-3" />
                                ) : btn.type === "PHONE_NUMBER" ? (
                                  <PhoneIcon className="size-3" />
                                ) : (
                                  <MessageSquareIcon className="size-3" />
                                );
                              return (
                                <div
                                  key={btnIdx}
                                  className="flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900 px-2 py-1 text-xs font-medium text-green-900 dark:text-green-100"
                                >
                                  {icon}
                                  <span className="truncate text-xs">
                                    {btn.text}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // Render standard template
          return (
            <div className="flex flex-col gap-2">
              <div className="text-sm">{payload.bodyText}</div>
              {payload.buttons && payload.buttons.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-black/10 dark:border-white/10 pt-2">
                  {payload.buttons.map((btn, idx) => {
                    const icon =
                      btn.type === "URL" ? (
                        <LinkIcon className="size-3.5" />
                      ) : btn.type === "PHONE_NUMBER" ? (
                        <PhoneIcon className="size-3.5" />
                      ) : btn.type === "FLOW" ? (
                        <Zap className="size-3.5" />
                      ) : (
                        <MessageSquareIcon className="size-3.5" />
                      );
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-full bg-green-100 dark:bg-green-900 px-3 py-1.5 text-xs font-medium text-green-900 dark:text-green-100"
                      >
                        {icon}
                        <span>{btn.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        } catch {
          // Fall back to body text if JSON parse fails
          return (
            <div className="text-sm italic">
              {message.body || "[plantilla]"}
            </div>
          );
        }
      }
      return (
        <div className="text-sm italic">{message.body || "[plantilla]"}</div>
      );
    }

    case "flow": {
      // Inbound nfm_reply (completed form)
      if (message.direction === "in") {
        if (message.payloadJson) {
          try {
            const payload = JSON.parse(message.payloadJson) as {
              interactive?: {
                type: "nfm_reply";
                nfm_reply?: {
                  response_json?: string;
                };
              };
            };

            const responseJson = payload.interactive?.nfm_reply?.response_json;
            if (responseJson) {
              const formData = JSON.parse(responseJson) as Record<
                string,
                unknown
              >;
              // Filter out flow_token and convert values to strings
              const entries = Object.entries(formData)
                .filter(([key]) => key !== "flow_token")
                .map(([key, value]) => [key, String(value || "").slice(0, 50)]);

              if (entries.length > 0) {
                return (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 max-w-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardListIcon className="size-4 text-blue-600 dark:text-blue-400" />
                      <div className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                        Formulario completado
                      </div>
                    </div>
                    <div className="space-y-1">
                      {entries.map(([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between text-xs text-blue-800 dark:text-blue-200"
                        >
                          <span className="font-medium">{key}:</span>
                          <span className="text-right max-w-xs truncate">
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            }
          } catch {
            // Fall back to body text if JSON parse fails
            return (
              <div className="text-sm italic text-muted-foreground">
                {message.body || "[formulario]"}
              </div>
            );
          }
        }
        return (
          <div className="text-sm italic text-muted-foreground">
            {message.body || "[formulario]"}
          </div>
        );
      }

      // Outbound flow (template we sent)
      if (message.payloadJson) {
        try {
          const payload = JSON.parse(message.payloadJson) as {
            kind: "flow";
            flowId: string;
            cta: string;
            bodyText: string;
          };
          return (
            <div className="flex flex-col gap-2">
              <div className="text-sm">{payload.bodyText}</div>
              <div className="flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-900 px-3 py-1.5 text-xs font-medium text-blue-900 dark:text-blue-100">
                <Zap className="size-3.5" />
                <span>{payload.cta}</span>
              </div>
            </div>
          );
        } catch {
          // Fall back to body text if JSON parse fails
          return (
            <div className="text-sm italic">
              {message.body || "[formulario]"}
            </div>
          );
        }
      }
      return (
        <div className="text-sm italic">{message.body || "[formulario]"}</div>
      );
    }

    case "reaction":
      return <span className="text-2xl">{message.body}</span>;

    case "unknown":
    default:
      return `[Mensaje no soportado: ${message.type}]`;
  }
}
