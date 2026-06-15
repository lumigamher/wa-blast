"use client";

import { useRef, useState } from "react";
import { PlayIcon, PauseIcon } from "lucide-react";

export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      void a.play();
    }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproducir"}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-transform hover:scale-110 active:scale-95"
      >
        {playing ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
      </button>

      <div className="h-1 flex-1 rounded-full bg-muted-foreground/20">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${dur ? (progress / dur) * 100 : 0}%` }}
        />
      </div>

      <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
        {fmt(dur ? dur - progress : 0)}
      </span>

      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
