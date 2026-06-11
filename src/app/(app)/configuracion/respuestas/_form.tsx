"use client";

import { useTransition, useState } from "react";
import { SendIcon } from "lucide-react";
import { createQuickReplyAction } from "./actions";

export function QuickRepliesForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const shortcut = String(formData.get("shortcut") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();

    if (!shortcut) {
      setError("El atajo es obligatorio");
      return;
    }
    if (!body) {
      setError("El mensaje es obligatorio");
      return;
    }

    startTransition(async () => {
      const result = await createQuickReplyAction({ shortcut, body });
      if (result.ok) {
        e.currentTarget.reset();
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="shortcut" className="block text-xs font-medium mb-1.5">
          Atajo <span className="text-red-600">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">/</span>
          <input
            id="shortcut"
            name="shortcut"
            type="text"
            placeholder="saludo"
            disabled={isPending}
            className="w-full px-3 py-2 pl-6 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label htmlFor="body" className="block text-xs font-medium mb-1.5">
          Mensaje <span className="text-red-600">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          placeholder="¡Hola! ¿En qué te ayudo?"
          disabled={isPending}
          rows={3}
          className="w-full px-3 py-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none"
        />
      </div>

      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Creando…" : "Crear"}
        {!isPending && <SendIcon className="size-3" />}
      </button>
    </form>
  );
}
