"use client";

import { useEffect, useState } from "react";
import { ImageOffIcon, XIcon } from "lucide-react";

export function MediaImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (errored) {
    return (
      <div className="flex items-center justify-center max-h-80 w-full max-w-full rounded-lg border border-black/5 bg-muted/50 aspect-square">
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOffIcon className="size-6" />
          <span className="text-xs">Imagen no disponible</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-auto max-h-80 w-auto max-w-full cursor-zoom-in rounded-lg border border-black/5 object-contain"
        onClick={() => setOpen(true)}
        onError={() => setErrored(true)}
      />
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setOpen(false)}
          >
            <XIcon className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
