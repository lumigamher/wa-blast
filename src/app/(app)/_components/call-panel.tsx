"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneIcon, PhoneOffIcon, MicIcon, MicOffIcon } from "lucide-react";
import { CallSession, type CallState } from "./call-session";
import {
  pollRingingCallsAction,
  getIceServersAction,
  getCallOfferAction,
  acceptCallAction,
  rejectCallAction,
  terminateCallAction,
} from "../llamadas/actions";

type Incoming = { id: string; phone: string; contactName: string | null; conversationId: string };

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch {
    /* silencioso */
  }
}

export function CallPanel() {
  const seen = useRef<Set<string>>(new Set());
  const session = useRef<CallSession | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [state, setState] = useState<CallState | "idle">("idle");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  function reset() {
    setIncoming(null);
    setState("idle");
    setMuted(false);
    setSeconds(0);
    session.current = null;
  }

  // Polling de llamadas entrantes (solo mientras estamos idle)
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.hidden || state !== "idle") return;
      try {
        if (seen.current.size > 5000) seen.current.clear();
        const ringing = await pollRingingCallsAction();
        if (cancelled) return;
        const fresh = ringing.find((c) => !seen.current.has(c.id));
        if (fresh) {
          seen.current.add(fresh.id);
          beep();
          setIncoming(fresh);
        }
      } catch {
        /* reintenta en el próximo tick */
      }
    }
    const interval = setInterval(tick, 5000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state]);

  // Cronómetro mientras connected
  useEffect(() => {
    if (state !== "connected") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Adjuntar el stream remoto al elemento de audio cuando conecta
  useEffect(() => {
    if (state === "connected" && audioEl.current && session.current?.remoteStream) {
      audioEl.current.srcObject = session.current.remoteStream;
    }
  }, [state]);

  async function onAccept() {
    if (!incoming) return;
    const [ice, offer] = await Promise.all([getIceServersAction(), getCallOfferAction(incoming.id)]);
    if ("error" in offer) {
      reset();
      return;
    }
    const cs = new CallSession(ice as RTCIceServer[], (s) => {
      setState(s);
      if (s === "ended") reset();
    });
    session.current = cs;
    const answerSdp = await cs.answer(offer.sdp);
    const res = await acceptCallAction(incoming.id, answerSdp);
    if ("error" in res) {
      cs.hangup();
      reset();
      return;
    }
    if (audioEl.current && cs.remoteStream) audioEl.current.srcObject = cs.remoteStream;
  }

  async function onReject() {
    if (!incoming) return;
    await rejectCallAction(incoming.id);
    reset();
  }

  async function onHangup() {
    const current = incoming;
    if (current) await terminateCallAction(current.id);
    const blob = (await session.current?.stopRecording()) ?? null;
    if (blob && current) {
      try {
        await fetch(`/api/calls/${current.id}/recording`, {
          method: "POST",
          body: blob,
          headers: { "content-type": "audio/webm" },
        });
      } catch {
        /* la grabación es best-effort */
      }
    }
    session.current?.hangup();
    reset();
  }

  function onToggleMute() {
    setMuted(session.current?.toggleMute() ?? false);
  }

  if (!incoming) return <audio ref={audioEl} autoPlay className="hidden" />;

  const name = incoming.contactName || incoming.phone;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-border bg-background p-4 shadow-lg">
      <audio ref={audioEl} autoPlay className="hidden" />
      <div className="text-sm font-semibold">{name}</div>
      <div className="text-xs text-muted-foreground">
        {state === "idle" || state === "connecting"
          ? "Llamada entrante…"
          : state === "connected"
            ? `En llamada · ${mm}:${ss}`
            : "Finalizando…"}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {state === "idle" ? (
          <>
            <button
              type="button"
              onClick={onAccept}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <PhoneIcon className="size-4" /> Atender
            </button>
            <button
              type="button"
              onClick={onReject}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              <PhoneOffIcon className="size-4" /> Rechazar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              {muted ? <MicOffIcon className="size-4" /> : <MicIcon className="size-4" />}
              {muted ? "Activar" : "Silenciar"}
            </button>
            <button
              type="button"
              onClick={onHangup}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              <PhoneOffIcon className="size-4" /> Colgar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
