"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  CheckCheckIcon,
  FileIcon,
  MoreVerticalIcon,
  SmileIcon,
} from "lucide-react";
import { messages as messagesSchema } from "@/lib/db/schema";
import { sendReactionAction } from "../../actions";
import type { InferSelectModel } from "drizzle-orm";
import { AudioPlayer } from "./audio-player";
import { ReactionChips } from "./reaction-chip";

type Message = InferSelectModel<typeof messagesSchema>;

type ThreadProps = {
  messages: Message[];
  onReplyTo: (wamid: string) => void;
  reactions: Record<string, { direction: "in" | "out"; emoji: string }[]>;
};

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

export function Thread({ messages, onReplyTo, reactions }: ThreadProps) {
  // Filter out legacy standalone reaction messages
  const visible = messages.filter((m) => m.type !== "reaction");

  if (visible.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No hay mensajes aún</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((msg, idx) => {
        const prevMsg = idx > 0 ? visible[idx - 1] : null;
        const currentDay = new Date(msg.createdAt);
        const prevDay = prevMsg ? new Date(prevMsg.createdAt) : null;

        const isDifferentDay =
          !prevDay ||
          currentDay.getFullYear() !== prevDay.getFullYear() ||
          currentDay.getMonth() !== prevDay.getMonth() ||
          currentDay.getDate() !== prevDay.getDate();

        return (
          <div key={msg.id}>
            {isDifferentDay && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {dayLabel(currentDay)}
                </span>
              </div>
            )}
            <MessageBubble
              message={msg}
              onReplyTo={onReplyTo}
              reactions={reactions[msg.wamid ?? ""] ?? []}
            />
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
}: {
  message: Message;
  onReplyTo: (wamid: string) => void;
  reactions: { direction: "in" | "out"; emoji: string }[];
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionsLoading, setReactionsLoading] = useState(false);
  const isOutbound = message.direction === "out";
  const time = message.createdAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const emojis = ["👍", "❤️", "😂", "😮", "🙏"];

  const handleReaction = async (emoji: string) => {
    if (!message.wamid || isOutbound) return;
    setReactionsLoading(true);
    try {
      await sendReactionAction(message.conversationId, { wamid: message.wamid, emoji });
    } finally {
      setReactionsLoading(false);
      setShowEmojiPicker(false);
    }
  };

  const bubbleContent = renderMessageContent(message);

  // Special case: stickers don't have colored background
  if (message.type === "sticker") {
    return (
      <div
        className={`flex gap-2 group ${
          isOutbound ? "flex-row-reverse justify-start" : "flex-row"
        }`}
        onMouseEnter={() => !isOutbound && setShowMenu(true)}
        onMouseLeave={() => {
          setShowMenu(false);
          setShowEmojiPicker(false);
        }}
      >
        <div className="relative">
          {bubbleContent}
          {reactions.length > 0 && <ReactionChips reactions={reactions} />}
        </div>

        {!isOutbound && (showMenu || showEmojiPicker) && message.wamid && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Opciones"
            >
              <MoreVerticalIcon className="size-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 rounded-md border bg-background shadow-lg z-10 overflow-hidden">
                <button
                  onClick={() => {
                    onReplyTo(message.wamid!);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                >
                  Responder
                </button>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <SmileIcon className="size-3" /> Reaccionar
                </button>
              </div>
            )}

            {showEmojiPicker && (
              <div className="absolute right-0 mt-1 rounded-md border bg-background shadow-lg z-10 p-2 flex gap-1">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    disabled={reactionsLoading}
                    className="text-xl hover:scale-110 transition-transform disabled:opacity-50"
                    title={`Reaccionar con ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Regular messages with colored background
  return (
    <div
      className={`flex gap-2 group ${
        isOutbound ? "flex-row-reverse justify-start" : "flex-row"
      }`}
      onMouseEnter={() => !isOutbound && setShowMenu(true)}
      onMouseLeave={() => {
        setShowMenu(false);
        setShowEmojiPicker(false);
      }}
    >
      <div className="relative">
        <div
          className={`max-w-xs rounded-lg px-3 py-2 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
            isOutbound
              ? "bg-emerald-100 dark:bg-emerald-900 text-foreground"
              : "bg-muted text-foreground"
          }`}
        >
          <div className="text-sm whitespace-pre-wrap break-words">
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

        {reactions.length > 0 && <ReactionChips reactions={reactions} />}
      </div>

      {isOutbound && message.status === "failed" && message.errorMessage && (
        <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
          <span title={message.errorMessage}>
            <AlertCircleIcon className="size-3" />
          </span>
        </div>
      )}

      {!isOutbound && (showMenu || showEmojiPicker) && message.wamid && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Opciones"
          >
            <MoreVerticalIcon className="size-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-1 rounded-md border bg-background shadow-lg z-10 overflow-hidden">
              <button
                onClick={() => {
                  onReplyTo(message.wamid!);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
              >
                Responder
              </button>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2"
              >
                <SmileIcon className="size-3" /> Reaccionar
              </button>
            </div>
          )}

          {showEmojiPicker && (
            <div className="absolute right-0 mt-1 rounded-md border bg-background shadow-lg z-10 p-2 flex gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  disabled={reactionsLoading}
                  className="text-xl hover:scale-110 transition-transform disabled:opacity-50"
                  title={`Reaccionar con ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
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

function renderMessageContent(message: Message): React.ReactNode {
  switch (message.type) {
    case "text":
      return message.body;

    case "image":
      return message.mediaId ? (
        <div className="space-y-2">
          {message.body && <div className="text-xs">{message.body}</div>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/inbox/media/${message.mediaId}`}
            alt="Image"
            className="max-w-xs rounded"
          />
        </div>
      ) : (
        `[Imagen]`
      );

    case "video":
      return message.mediaId ? (
        <div className="space-y-2">
          {message.body && <div className="text-xs">{message.body}</div>}
          <video
            src={`/api/inbox/media/${message.mediaId}`}
            controls
            className="max-w-xs rounded"
          />
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
