"use client";

import { useEffect, useState } from "react";
import { XIcon, DownloadIcon, Maximize2Icon } from "lucide-react";

export function MediaVideo({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="relative">
        <video
          src={src}
          controls
          preload="metadata"
          className="h-auto max-h-80 w-auto max-w-full rounded-lg border border-black/5 object-contain"
        />
        <button
          type="button"
          aria-label="Ampliar"
          className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
          onClick={() => setOpen(true)}
        >
          <Maximize2Icon className="size-4" />
        </button>
      </div>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Video"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="absolute right-4 top-4 flex gap-2">
            <a
              href={src}
              download="video"
              aria-label="Descargar"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <DownloadIcon className="size-5" />
            </a>
            <button
              type="button"
              aria-label="Cerrar"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={() => setOpen(false)}
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <video
            src={src}
            controls
            autoPlay
            className="max-h-[90vh] max-w-[90vw] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
