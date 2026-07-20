"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { XIcon } from "lucide-react";

/** Panel lateral que muestra el detalle de un pedido sobre el tablero. */
export function OrderSheet({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // En navegación suave el slot paralelo retiene su contenido: el sheet solo
  // es visible mientras la URL sea /pedidos/<id>.
  const isOpen = /^\/pedidos\/.+/.test(pathname);
  const close = () => router.push("/pedidos", { scroll: false });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Cerrar detalle"
        className="absolute inset-0 bg-black/30"
        onClick={close}
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col overflow-hidden border-l bg-background shadow-2xl md:my-3 md:mr-3 md:h-auto md:rounded-lg md:border">
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar detalle"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <XIcon className="size-4" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
