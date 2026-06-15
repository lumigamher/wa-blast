"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveConversationAction } from "@/app/(app)/inbox/actions";

export function ResolveButton({
  conversationId,
  resolved,
}: {
  conversationId: string;
  resolved: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleResolve = () => {
    startTransition(async () => {
      await resolveConversationAction(conversationId, !resolved);
      router.refresh();
    });
  };

  if (resolved) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
          Resuelta
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResolve}
          disabled={isPending}
          aria-label="Reabrir conversación"
          title="Reabrir conversación"
          className="h-9 px-2.5 text-xs"
        >
          <RotateCcwIcon className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleResolve}
      disabled={isPending}
      aria-label="Resolver conversación"
      title="Resolver conversación"
      className="h-9 px-2.5 text-xs"
    >
      <CheckIcon className="size-4" />
      Resolver
    </Button>
  );
}
