import { MessageSquareIcon } from "lucide-react";

export default function DetailDefaultSlot() {
  return (
    <div className="hidden md:flex min-h-0 flex-col items-center justify-center h-full rounded-lg border border-dashed">
      <MessageSquareIcon className="size-12 text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">
        Selecciona una conversación
      </p>
    </div>
  );
}
