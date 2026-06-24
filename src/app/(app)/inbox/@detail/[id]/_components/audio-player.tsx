"use client";

import { useRef, useState, useEffect } from "react";
import { PlayIcon, PauseIcon } from "lucide-react";

function computePeaks(buf: AudioBuffer, n = 48): number[] {
  const data = buf.getChannelData(0);
  const block = Math.floor(data.length / n) || 1;
  const peaks: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < block; j++) sum += Math.abs(data[i * block + j] || 0);
    peaks.push(sum / block);
  }
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / max);
}

export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);

  useEffect(() => {
    let aborted = false;

    const decode = async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const AudioCtxConstructor = (
          window.AudioContext ||
          (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext
        );
        const ctx = new AudioCtxConstructor();
        const decoded = await ctx.decodeAudioData(buf);
        if (!aborted) {
          setPeaks(computePeaks(decoded, 48));
          // Use decoded buffer duration as authoritative source (fixes Infinity/NaN for streamed OGG/Opus)
          setDur(decoded.duration);
        }
        void ctx.close();
      } catch {
        if (!aborted) setDecodeFailed(true);
      }
    };

    void decode();
    return () => {
      aborted = true;
    };
  }, [src]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      void a.play();
    }
  };

  const handleWaveformClick = (ratio: number) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = ratio * dur;
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  const playedRatio = dur ? progress / dur : 0;

  return (
    <div className="flex items-center gap-3 w-full">
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

      {peaks && !decodeFailed ? (
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            handleWaveformClick(Math.max(0, Math.min(1, ratio)));
          }}
          aria-label="Barra de progreso de audio"
          className="flex-1 min-w-0 flex items-center justify-between gap-[2px] h-7 px-2 rounded cursor-pointer group overflow-hidden"
        >
          {peaks.map((peak, i) => (
            <div
              key={i}
              className={`flex-1 min-w-0 max-w-[3px] rounded-full transition-colors ${
                i / peaks.length < playedRatio
                  ? "bg-emerald-600"
                  : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
              }`}
              style={{
                height: `${Math.max(10, peak * 100)}%`,
              }}
              aria-hidden="true"
            />
          ))}
        </button>
      ) : (
        <div className="h-1 flex-1 min-w-0 rounded-full bg-muted-foreground/20">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{ width: `${dur ? (progress / dur) * 100 : 0}%` }}
          />
        </div>
      )}

      <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap shrink-0">
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
