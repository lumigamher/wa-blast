"use client";

import { useTransition } from "react";
import { TrashIcon } from "lucide-react";
import { deleteQuickReplyAction } from "./actions";

export function QuickReplyItem({ reply }: { reply: { id: string; shortcut: string; body: string } }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      await deleteQuickReplyAction(reply.id);
    });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <code className="rounded bg-muted px-2 py-1 text-xs font-semibold text-foreground">/{reply.shortcut}</code>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="rounded p-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
          title="Eliminar"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
      <p className="line-clamp-3 text-xs text-muted-foreground whitespace-pre-wrap">{reply.body}</p>
    </div>
  );
}
