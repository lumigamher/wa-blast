"use client";

import { SmileIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onPick, disabled = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    onPick(emojiData.emoji);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Insert emoji"
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <SmileIcon className="size-5" />
      </button>
      {open && (
        <div
          ref={containerRef}
          className="absolute bottom-full left-0 mb-2 z-50 rounded-lg shadow-lg"
        >
          <Picker
            onEmojiClick={handleEmojiClick}
            searchPlaceHolder="Buscar emoji…"
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            width={320}
            height={400}
          />
        </div>
      )}
    </div>
  );
}
