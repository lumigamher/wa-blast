"use client";

import { useEffect, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";

/**
 * Barra superior móvil + drawer lateral con la navegación del panel.
 * Recibe el contenido del sidebar (server-rendered) como children.
 * Se cierra al tocar cualquier link de navegación o el fondo.
 */
export function MobileSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Bloquea el scroll del body y cierra con Escape mientras el drawer está abierto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="flex items-center gap-2 border-b bg-sidebar px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <MenuIcon className="size-5" />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          L
        </div>
        <span className="text-sm font-semibold">Lula</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="absolute right-2 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <XIcon className="size-4" />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
