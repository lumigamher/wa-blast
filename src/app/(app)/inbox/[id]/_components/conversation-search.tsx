"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

/**
 * Lupa en el header que se expande animada en un campo de búsqueda.
 * Emite el texto al hilo vía el evento `lula:thread-search` (lo escucha Thread).
 */
export function ConversationSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("lula:thread-search", { detail: { query: q } }));
  }, [q]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setQ("");
    setOpen(false);
  }

  return (
    <div
      className={`flex items-center overflow-hidden rounded-full border bg-muted transition-[width] duration-200 ease-out ${
        open ? "w-48" : "w-9"
      }`}
    >
      <button
        type="button"
        aria-label={open ? "Cerrar búsqueda" : "Buscar en la conversación"}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex size-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <XIcon className="size-4" /> : <SearchIcon className="size-4" />}
      </button>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder="Buscar…"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className="min-w-0 flex-1 bg-transparent pr-2 text-sm focus:outline-none"
      />
    </div>
  );
}
