"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pollRingingCallsAction } from "../llamadas/actions";

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
    // autoplay bloqueado o sin Web Audio: notificación silenciosa
  }
}

export function IncomingCallPoller() {
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.hidden) return;
      try {
        const ringing = await pollRingingCallsAction();
        if (cancelled) return;
        if (seen.current.size > 5000) seen.current.clear();
        for (const call of ringing) {
          if (seen.current.has(call.id)) continue;
          seen.current.add(call.id);
          beep();
          toast(`📞 Llamada entrante de ${call.contactName || call.phone}`, {
            description: call.phone,
            action: {
              label: "Ver",
              onClick: () => router.push(`/inbox/${call.conversationId}`),
            },
            duration: 20000,
          });
        }
      } catch {
        // red caída: el próximo tick reintenta
      }
    }
    const interval = setInterval(tick, 5000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
