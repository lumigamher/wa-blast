"use client";

import { useOptimistic, useTransition } from "react";
import { StarIcon } from "lucide-react";
import { toast } from "sonner";
import { toggleFavoriteAction } from "@/app/(app)/plantillas/actions";

export function FavoriteButton({
  name,
  language,
  favorited: initial,
  size = "md",
}: {
  name: string;
  language: string;
  favorited: boolean;
  size?: "sm" | "md";
}) {
  const [optimistic, setOptimistic] = useOptimistic(initial);
  const [pending, startTransition] = useTransition();

  const iconSize = size === "sm" ? "size-3.5" : "size-4";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          setOptimistic(!optimistic);
          const res = await toggleFavoriteAction(name, language);
          if (!res.ok) {
            toast.error(res.error);
            setOptimistic(initial);
          }
        });
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition ${
        size === "sm" ? "size-6" : "size-7"
      } ${
        optimistic
          ? "text-amber-500 hover:text-amber-600"
          : "text-muted-foreground hover:text-amber-500"
      } hover:bg-accent disabled:opacity-50`}
      title={optimistic ? "Quitar de favoritas" : "Marcar como favorita"}
      aria-label={optimistic ? "Quitar de favoritas" : "Marcar como favorita"}
    >
      <StarIcon
        className={iconSize}
        fill={optimistic ? "currentColor" : "none"}
      />
    </button>
  );
}
