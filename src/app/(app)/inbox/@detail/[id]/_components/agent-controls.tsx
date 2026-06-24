"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play } from "lucide-react";
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

  return (
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        onClick={handleToggle}
        disabled={isPending}
        className={`h-9 w-9 ${agentPaused ? "text-amber-600 dark:text-amber-400" : ""}`}
        title={agentPaused ? "Retomar IA" : "Pausar IA"}
      >
        {agentPaused ? (
          <Play className="size-4" />
        ) : (
          <Pause className="size-4" />
        )}
      </Button>
      {agentPaused && (
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          IA en pausa
        </span>
      )}
    </div>
  );
}
