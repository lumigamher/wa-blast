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
        <div className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs whitespace-nowrap">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          <span className="text-emerald-700 dark:text-emerald-400">Resuelta</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResolve}
          disabled={isPending}
          aria-label="Reabrir conversación"
          title="Reabrir conversación"
          className="h-9 w-9 rounded-full p-0 text-muted-foreground"
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
      className="h-9 rounded-full px-3.5 text-xs"
    >
      <CheckIcon className="size-4" />
      Resolver
    </Button>
  );
}
