"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setAgentPausedAction } from "@/app/(app)/inbox/actions";

export function AgentControls({
  conversationId,
  agentEnabled,
  agentPaused,
}: {
  conversationId: string;
  agentEnabled: boolean;
  agentPaused: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!agentEnabled) return null;

  const handleToggle = () => {
    startTransition(async () => {
      const result = await setAgentPausedAction(conversationId, !agentPaused);
      if ("ok" in result && result.ok) {
        router.refresh();
      } else if ("error" in result) {
        toast.error(result.error || "No se pudo cambiar el estado de la IA");
      }
    });
  };

  if (agentPaused) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
        <AlertCircleIcon className="size-4 text-amber-700 dark:text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            La IA está en pausa en este chat
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleToggle}
          disabled={isPending}
          className="h-8 text-xs flex-shrink-0"
        >
          Retomar IA
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleToggle}
      disabled={isPending}
      className="h-9"
    >
      Pausar IA
    </Button>
  );
}
