"use client";

import { useState } from "react";
import { ImageOffIcon } from "lucide-react";

export function MediaImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="flex items-center justify-center max-h-80 max-w-sm rounded-lg border border-black/5 bg-muted/50 aspect-square">
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOffIcon className="size-6" />
          <span className="text-xs">Imagen no disponible</span>
        </div>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="max-h-80 max-w-sm rounded-lg border border-black/5 object-cover"
      onError={() => setErrored(true)}
    />
  );
}
