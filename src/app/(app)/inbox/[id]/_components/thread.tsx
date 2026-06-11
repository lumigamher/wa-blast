"use client";

import { AlertCircleIcon, CheckIcon, CheckCheckIcon, FileIcon } from "lucide-react";
import { messages as messagesSchema } from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";

type Message = InferSelectModel<typeof messagesSchema>;

export function Thread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No hay mensajes aún</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "out";
  const time = message.createdAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const bubbleContent = renderMessageContent(message);

  return (
    <div
      className={`flex gap-2 ${
        isOutbound ? "flex-row-reverse justify-start" : "flex-row"
      }`}
    >
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

      {isOutbound && message.status === "failed" && message.errorMessage && (
        <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
          <span title={message.errorMessage}>
            <AlertCircleIcon className="size-3" />
          </span>
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
        <audio
          src={`/api/inbox/media/${message.mediaId}`}
          controls
          className="max-w-xs"
        />
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
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/inbox/media/${message.mediaId}`}
            alt="Sticker"
            className="max-w-xs rounded"
          />
        </div>
      ) : (
        `[Sticker]`
      );

    case "reaction":
      return <span className="text-2xl">{message.body}</span>;

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

    case "unknown":
    default:
      return `[Mensaje no soportado: ${message.type}]`;
  }
}
