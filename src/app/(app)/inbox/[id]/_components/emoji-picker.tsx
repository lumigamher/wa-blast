"use client";

import { SmileIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const EMOJI_CATEGORIES = {
  smileys: [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
    "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰",
  ],
  gestures: [
    "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏",
    "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👍", "👎",
  ],
  hearts: [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
    "🤎", "💔", "💕", "💞", "💓", "💗", "💖", "💘",
  ],
  objects: [
    "🎉", "🎊", "🎈", "🎁", "🎀", "🎂", "🍰", "⭐",
    "✨", "🌟", "💫", "🔥", "💯", "🎯", "💡", "🚀",
  ],
};

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onPick, disabled = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEmojiClick = (emoji: string) => {
    onPick(emoji);
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
          className="absolute bottom-full left-0 mb-2 w-80 rounded-lg border bg-background p-4 shadow-lg max-h-96 overflow-y-auto"
        >
          <div className="space-y-4">
            {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground capitalize">
                  {category}
                </h3>
                <div className="grid grid-cols-8 gap-1">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleEmojiClick(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label={`Insert emoji ${emoji}`}
                    >
                      <span className="text-lg">{emoji}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
