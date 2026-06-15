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
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((b: Blob | null) => void) | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolveRef.current?.(
          chunksRef.current.length
            ? new Blob(chunksRef.current, { type: rec.mimeType })
            : null
        );
      };
      recRef.current = rec;
      rec.start();
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
    <div className="flex flex-1 items-center gap-2">
      <button
        type="button"
        onClick={() => finish(false)}
        aria-label="Cancelar grabación"
        className="rounded-full p-2 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
      >
        <Trash2Icon className="size-5" />
      </button>
      <span className="flex items-center gap-1.5 text-sm text-red-600">
        <span className="size-2 animate-pulse rounded-full bg-red-600" />
        {fmt}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => finish(true)}
        aria-label="Enviar nota de voz"
        className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
      >
        <SendIcon className="size-4" />
      </button>
    </div>
  );
}
