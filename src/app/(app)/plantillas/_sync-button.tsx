"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncTemplatesAction } from "./actions";

export function SyncTemplatesButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await syncTemplatesAction();
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else {
            toast.error(res.message);
          }
        });
      }}
    >
      <RefreshCwIcon
        className={`size-3.5 ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Sincronizando…" : "Sincronizar"}
    </Button>
  );
}
