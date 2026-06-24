"use client";

import { useRef, useState } from "react";
import { MicIcon, SendIcon, Trash2Icon } from "lucide-react";

export function VoiceRecorder({
  onSend,
  disabled,
}: {
  onSend: (dataBase64: string, mime: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(24).fill(0));
  const [reducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((b: Blob | null) => void) | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        stream.getTracks().forEach((t) => t.stop());
        if (ctxRef.current) void ctxRef.current.close();
        analyserRef.current = null;
        ctxRef.current = null;
        resolveRef.current?.(
          chunksRef.current.length
            ? new Blob(chunksRef.current, { type: rec.mimeType })
            : null
        );
      };
      recRef.current = rec;
      rec.start();

      // Setup Web Audio analyser for live waveform
      if (!reducedMotion) {
        const AudioCtxConstructor = (
          window.AudioContext ||
          (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext
        );
        const audioCtx = new AudioCtxConstructor();
        ctxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const updateLevels = () => {
          if (!analyserRef.current) return;
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(data);
          const blockSize = Math.ceil(data.length / 24);
          const newLevels: number[] = [];
          for (let i = 0; i < 24; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += data[i * blockSize + j] || 0;
            }
            newLevels.push((sum / blockSize) / 255);
          }
          setLevels(newLevels);
          rafRef.current = requestAnimationFrame(updateLevels);
        };
        rafRef.current = requestAnimationFrame(updateLevels);
      }

      setRecording(true);
      setSecs(0);
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      // Permiso denegado: no-op
    }
  };

  const finish = (send: boolean): Promise<void> =>
    new Promise((resolve) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setRecording(false);
      resolveRef.current = async (blob) => {
        if (send && blob) {
          const buf = await blob.arrayBuffer();
          let bin = "";
          new Uint8Array(buf).forEach((b) => {
            bin += String.fromCharCode(b);
          });
          await onSend(btoa(bin), blob.type);
        }
        resolve();
      };
      recRef.current?.stop();
    });

  if (!recording) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label="Grabar nota de voz"
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <MicIcon className="size-5" />
      </button>
    );
  }

  const fmt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-1 items-center gap-3">
      <button
        type="button"
        onClick={() => finish(false)}
        aria-label="Cancelar grabación"
        className="rounded-full p-2 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0"
      >
        <Trash2Icon className="size-5" />
      </button>

      {reducedMotion ? (
        <span className="flex items-center gap-1.5 text-sm text-red-600 shrink-0">
          <span className="size-2 animate-pulse rounded-full bg-red-600" />
          <span>Grabando…</span>
        </span>
      ) : (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="flex items-center gap-1 text-xs font-medium text-red-600 whitespace-nowrap">
            <span className="size-2 animate-pulse rounded-full bg-red-600" />
            {fmt}
          </span>
          <div className="flex items-center justify-center gap-0.5 h-6 flex-1 px-1">
            {levels.map((level, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-red-600 transition-all"
                style={{
                  height: `${Math.max(6, level * 100)}%`,
                }}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      )}

      {reducedMotion && <span className="text-xs text-red-600">{fmt}</span>}

      <button
        type="button"
        onClick={() => finish(true)}
        aria-label="Enviar nota de voz"
        className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0"
      >
        <SendIcon className="size-4" />
      </button>
    </div>
  );
}
