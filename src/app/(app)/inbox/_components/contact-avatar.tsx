"use client";

import { useState } from "react";

export function ContactAvatar({
  seed,
  name,
  size = 40,
  className = "",
}: {
  seed: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const initial = (name?.trim() || seed || "?").charAt(0).toUpperCase();
  const url = `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(seed ?? "?")}`;

  if (errored) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name ? `Avatar de ${name}` : "Avatar"}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={`shrink-0 rounded-full bg-muted ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
