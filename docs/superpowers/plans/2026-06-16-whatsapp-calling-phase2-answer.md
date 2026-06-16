# WhatsApp Calling — Fase 2: Atender con audio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un agente humano conteste una llamada entrante de WhatsApp con audio real desde el navegador de Lula (WebRTC navegador↔Meta), con atender/rechazar/colgar/silenciar, cronómetro y grabación client-side.

**Architecture:** El navegador es el peer WebRTC; el SDP offer ya está persistido en `calls.sdp` (Fase 1), así que la señalización usa el polling existente + server actions con ICE no-trickle (sin WebSocket). Las acciones de llamada van por `POST /{phoneId}/calls` (Graph v24.0). TURN lo da un coturn self-hosted con credenciales efímeras. La grabación se hace en el navegador (MediaRecorder mezclando pista local + remota) y se sube por el pipeline de media existente.

**Tech Stack:** Next.js 15 (App Router, server actions, route handlers), WebRTC (RTCPeerConnection, getUserMedia, MediaRecorder, Web Audio API), Drizzle/SQLite, coturn, Vitest, Bun.

---

## File Structure

- `src/lib/env.ts` — añade `TURN_URL`, `TURN_SECRET`, `META_GRAPH_VERSION` (modify).
- `src/lib/meta/calling.ts` — `callAction` + `acceptCall`/`rejectCall`/`terminateCall`; versión Graph configurable (modify).
- `src/lib/calls/ice.ts` — `buildIceServers()`: STUN + credencial efímera TURN coturn (create).
- `src/lib/calls/store.ts` — `markCallConnected`, `markCallRejected`, `getCallById`; ajuste de `recordCallEvent` para cerrar `connected` en terminate; `setRecordingMediaId` (modify).
- `src/lib/db/schema/domain.ts` — enum `connected` + `answeredAt` + `recordingMediaId` en `calls` (modify).
- `drizzle/migrations/0011_*.sql` — generada (create).
- `src/app/(app)/llamadas/actions.ts` — `getCallOffer`, `getIceServers`, `acceptCall`, `rejectCall`, `terminateCall` (modify).
- `src/app/(app)/_components/call-session.ts` — módulo cliente WebRTC (create).
- `src/app/(app)/_components/call-panel.tsx` — widget flotante + polling + máquina de estados; reemplaza a `IncomingCallPoller` (create).
- `src/app/(app)/layout.tsx` — montar `<CallPanel />` en vez de `<IncomingCallPoller />` (modify).
- `src/app/api/calls/[callId]/recording/route.ts` — upload de la grabación (create, Fase 2b).
- `src/app/(app)/llamadas/page.tsx` y `src/app/(app)/inbox/[id]/_components/call-entry.tsx` — `<audio controls>` si hay grabación (modify, Fase 2b).
- Tests: `tests/unit/calling-actions.test.ts` (create), extender `tests/unit/calls-store.test.ts`, `tests/unit/ice.test.ts` (create).

---

# FASE 2a — Núcleo (atender/rechazar/colgar/mute con audio)

## Task 1: Env vars para TURN y versión Graph

**Files:**
- Modify: `src/lib/env.ts:24-37`

- [ ] **Step 1: Añadir las vars al schema zod**

En `src/lib/env.ts`, dentro del `z.object({ ... })`, tras `META_APP_SECRET`:

```ts
  META_GRAPH_VERSION: z.string().default("v24.0"),
  TURN_URL: z.string().optional(),
  TURN_SECRET: z.string().optional(),
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/"`
Expected: sin salida (limpio).

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(llamadas): env TURN_URL/TURN_SECRET/META_GRAPH_VERSION"
```

---

## Task 2: Acciones de llamada en el cliente Meta

**Files:**
- Modify: `src/lib/meta/calling.ts`
- Test: `tests/unit/calling-actions.test.ts` (create)

- [ ] **Step 1: Test que falla — cuerpos POST de accept/reject/terminate**

Crea `tests/unit/calling-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { acceptCall, rejectCall, terminateCall } from "@/lib/meta/calling";
import type { DecryptedSettings } from "@/lib/org/settings";

const s = { metaPhoneId: "PID", metaAccessToken: "TOK" } as DecryptedSettings;

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOk() {
  const fn = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("calling actions", () => {
  it("acceptCall postea action accept con session answer", async () => {
    const fetchFn = mockFetchOk();
    const res = await acceptCall(s, "CID", "v=0 answer");
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/PID/calls");
    expect(JSON.parse(init.body)).toEqual({
      call_id: "CID",
      action: "accept",
      session: { sdp: "v=0 answer", sdp_type: "answer" },
    });
    expect(init.headers.authorization).toBe("Bearer TOK");
  });
  it("rejectCall y terminateCall postean su action sin session", async () => {
    const fetchFn = mockFetchOk();
    await rejectCall(s, "CID");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ call_id: "CID", action: "reject" });
    await terminateCall(s, "CID");
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({ call_id: "CID", action: "terminate" });
  });
  it("sin creds Meta devuelve error", async () => {
    const res = await acceptCall({ metaPhoneId: null, metaAccessToken: null } as DecryptedSettings, "CID", "x");
    expect(res).toHaveProperty("error");
  });
});
```

- [ ] **Step 2: Run test — debe fallar**

Run: `bun run test -- calling-actions`
Expected: FAIL (`acceptCall`/`rejectCall`/`terminateCall` no existen).

- [ ] **Step 3: Implementar en calling.ts**

En `src/lib/meta/calling.ts`, cambia la const de versión por una basada en env y añade las funciones. Reemplaza la línea `const GRAPH = "https://graph.facebook.com/v22.0";` por:

```ts
import { env } from "@/lib/env";

const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;
```

Y al final del archivo:

```ts
type CallActionBody = {
  call_id: string;
  action: "accept" | "reject" | "terminate";
  session?: { sdp: string; sdp_type: "answer" };
};

export async function callAction(
  s: DecryptedSettings,
  body: CallActionBody,
): Promise<{ ok: true } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) {
    return { error: "Meta no configurado" };
  }
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/calls`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${s.metaAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "Acción de llamada falló" };
  }
  return { ok: true };
}

export function acceptCall(s: DecryptedSettings, callId: string, answerSdp: string) {
  return callAction(s, { call_id: callId, action: "accept", session: { sdp: answerSdp, sdp_type: "answer" } });
}

export function rejectCall(s: DecryptedSettings, callId: string) {
  return callAction(s, { call_id: callId, action: "reject" });
}

export function terminateCall(s: DecryptedSettings, callId: string) {
  return callAction(s, { call_id: callId, action: "terminate" });
}
```

- [ ] **Step 4: Run test — debe pasar**

Run: `bun run test -- calling-actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta/calling.ts tests/unit/calling-actions.test.ts
git commit -m "feat(llamadas): acciones de llamada Meta (accept/reject/terminate) v24"
```

---

## Task 3: Migración 0011 + estados del store

**Files:**
- Modify: `src/lib/db/schema/domain.ts` (tabla `calls`)
- Create: `drizzle/migrations/0011_*.sql`
- Modify: `src/lib/calls/store.ts`
- Test: `tests/unit/calls-store.test.ts`

- [ ] **Step 1: Schema — enum + columnas**

En `src/lib/db/schema/domain.ts`, en la tabla `calls`:

- Cambia el enum de `status` a incluir `connected`:

```ts
    status: text("status", { enum: ["ringing", "connected", "missed", "completed", "rejected", "failed"] }).notNull(),
```

- Tras `sdpType: text("sdp_type"),` añade:

```ts
    answeredAt: integer("answered_at", { mode: "timestamp" }),
    recordingMediaId: text("recording_media_id"),
```

- [ ] **Step 2: Generar migración**

Run: `bunx drizzle-kit generate`
Expected: crea `drizzle/migrations/0011_*.sql` con `ALTER TABLE calls ADD answered_at integer;` y `ALTER TABLE calls ADD recording_media_id text;` (el cambio de enum es a nivel de tipo TS, no genera SQL en columna text).

- [ ] **Step 3: Test que falla — connected no-terminal y helpers**

En `tests/unit/calls-store.test.ts`, añade al import de `@/lib/calls/store`: `getCallById, markCallConnected, markCallRejected`. Añade los tests:

```ts
  it("markCallConnected pone connected + answeredAt; terminate luego cierra a completed", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "cc", direction: "in", event: "connect", ts: new Date(1000) });
    const before = (await db.select().from(calls).where(eq(calls.wacid, "cc")))[0];
    await markCallConnected(db, "o1", before.id, new Date(1500));
    let row = await getCallById(db, "o1", before.id);
    expect(row?.status).toBe("connected");
    expect(row?.answeredAt?.getTime()).toBe(1500);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "cc", direction: "in", event: "terminate", durationSec: 12, ts: new Date(2000) });
    row = await getCallById(db, "o1", before.id);
    expect(row?.status).toBe("completed");
  });
  it("connect duplicado no degrada un connected", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "dup", direction: "in", event: "connect", ts: new Date(1000) });
    const id = (await db.select().from(calls).where(eq(calls.wacid, "dup")))[0].id;
    await markCallConnected(db, "o1", id, new Date(1500));
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "dup", direction: "in", event: "connect", ts: new Date(1600) });
    expect((await getCallById(db, "o1", id))?.status).toBe("connected");
  });
  it("markCallRejected pone rejected", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await recordCallEvent(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "rj", direction: "in", event: "connect", ts: new Date(1000) });
    const id = (await db.select().from(calls).where(eq(calls.wacid, "rj")))[0].id;
    await markCallRejected(db, "o1", id);
    expect((await getCallById(db, "o1", id))?.status).toBe("rejected");
  });
```

- [ ] **Step 4: Run test — debe fallar**

Run: `bun run test -- calls-store`
Expected: FAIL (helpers no existen; terminate no cierra connected con la guarda actual).

- [ ] **Step 5: Ajustar `recordCallEvent` y añadir helpers**

En `src/lib/calls/store.ts`, en `recordCallEvent`, cambia la línea del `.set({...})` que fija el status por una guarda que permite que `terminate` cierre `connected` pero impide que un `connect` tardío degrade un estado no-ringing:

```ts
        status: e.event === "terminate" ? status : (existing.status === "ringing" ? status : existing.status),
```

Al final del archivo añade:

```ts
export async function getCallById(db: DB, orgId: string, id: string) {
  const [row] = await db.select().from(calls).where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
  return row ?? null;
}

export async function markCallConnected(db: DB, orgId: string, id: string, at: Date): Promise<void> {
  await db
    .update(calls)
    .set({ status: "connected", answeredAt: at, startedAt: at })
    .where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}

export async function markCallRejected(db: DB, orgId: string, id: string): Promise<void> {
  await db
    .update(calls)
    .set({ status: "rejected", endedAt: new Date() })
    .where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}

export async function setRecordingMediaId(db: DB, orgId: string, id: string, mediaId: string): Promise<void> {
  await db
    .update(calls)
    .set({ recordingMediaId: mediaId })
    .where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}
```

- [ ] **Step 6: Run test — debe pasar**

Run: `bun run test -- calls-store`
Expected: PASS (todos, incluidos los previos).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations src/lib/calls/store.ts tests/unit/calls-store.test.ts
git commit -m "feat(llamadas): estado connected + answeredAt + recordingMediaId (mig 0011) y helpers de store"
```

---

## Task 4: ICE servers con credencial efímera de coturn

**Files:**
- Create: `src/lib/calls/ice.ts`
- Test: `tests/unit/ice.test.ts` (create)

- [ ] **Step 1: Test que falla**

Crea `tests/unit/ice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildIceServers } from "@/lib/calls/ice";

describe("buildIceServers", () => {
  it("sin TURN configurado devuelve solo STUN público", () => {
    const servers = buildIceServers({ turnUrl: undefined, turnSecret: undefined, nowSec: 1000 });
    expect(servers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });
  it("con TURN genera credencial efímera HMAC-SHA1", () => {
    const servers = buildIceServers({ turnUrl: "turn:turn.luladev.com:3478", turnSecret: "shh", nowSec: 1000, ttlSec: 3600 });
    const turn = servers.find((s) => String(s.urls).startsWith("turn:"))!;
    const expectedUser = "4600"; // 1000 + 3600
    const expectedCred = createHmac("sha1", "shh").update(expectedUser).digest("base64");
    expect(turn.username).toBe(expectedUser);
    expect(turn.credential).toBe(expectedCred);
    // STUN sigue presente
    expect(servers.some((s) => String(s.urls).startsWith("stun:"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — debe fallar**

Run: `bun run test -- ice`
Expected: FAIL (`buildIceServers` no existe).

- [ ] **Step 3: Implementar `src/lib/calls/ice.ts`**

```ts
import { createHmac } from "node:crypto";

type IceServer = { urls: string; username?: string; credential?: string };

export function buildIceServers(opts: {
  turnUrl?: string;
  turnSecret?: string;
  nowSec: number;
  ttlSec?: number;
}): IceServer[] {
  const servers: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (opts.turnUrl && opts.turnSecret) {
    const username = String(opts.nowSec + (opts.ttlSec ?? 3600));
    const credential = createHmac("sha1", opts.turnSecret).update(username).digest("base64");
    servers.push({ urls: opts.turnUrl, username, credential });
  }
  return servers;
}
```

- [ ] **Step 4: Run test — debe pasar**

Run: `bun run test -- ice`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calls/ice.ts tests/unit/ice.test.ts
git commit -m "feat(llamadas): buildIceServers con credencial efímera coturn + fallback STUN"
```

---

## Task 5: Server actions de llamada

**Files:**
- Modify: `src/app/(app)/llamadas/actions.ts`

- [ ] **Step 1: Implementar las acciones**

En `src/app/(app)/llamadas/actions.ts`, añade los imports y las acciones (reusa el `pollRingingCallsAction` ya existente):

```ts
import { acceptCall, rejectCall, terminateCall } from "@/lib/meta/calling";
import { getOrgSettings } from "@/lib/org/settings";
import { buildIceServers } from "@/lib/calls/ice";
import { getCallById, markCallConnected, markCallRejected } from "@/lib/calls/store";
import { env } from "@/lib/env";

export async function getIceServersAction(): Promise<RTCIceServer[]> {
  await requireOrg();
  return buildIceServers({
    turnUrl: env.TURN_URL,
    turnSecret: env.TURN_SECRET,
    nowSec: Math.floor(Date.now() / 1000),
  });
}

export async function getCallOfferAction(callId: string): Promise<{ sdp: string } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call?.sdp) return { error: "Sin oferta SDP" };
  return { sdp: call.sdp };
}

export async function acceptCallAction(callId: string, answerSdp: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  const settings = await getOrgSettings(db, orgId);
  const res = await acceptCall(settings, call.wacid, answerSdp);
  if ("ok" in res) await markCallConnected(db, orgId, callId, new Date());
  return res;
}

export async function rejectCallAction(callId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  const settings = await getOrgSettings(db, orgId);
  const res = await rejectCall(settings, call.wacid);
  if ("ok" in res) await markCallRejected(db, orgId, callId);
  return res;
}

export async function terminateCallAction(callId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  const settings = await getOrgSettings(db, orgId);
  return terminateCall(settings, call.wacid);
}
```

Nota: `RTCIceServer` es un tipo del DOM lib; al ser un archivo `"use server"` importado por cliente, devolver el array plano es seguro (es JSON serializable). Si tsc se queja del tipo `RTCIceServer` en contexto server, declara el retorno como `{ urls: string; username?: string; credential?: string }[]`.

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint`
Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/llamadas/actions.ts"
git commit -m "feat(llamadas): server actions offer/ice/accept/reject/terminate"
```

---

## Task 6: Módulo WebRTC cliente `call-session.ts`

**Files:**
- Create: `src/app/(app)/_components/call-session.ts`

(No unit test: requiere WebRTC del navegador. Verificación = typecheck/lint + prueba manual en Task 9.)

- [ ] **Step 1: Implementar el módulo**

Crea `src/app/(app)/_components/call-session.ts`:

```ts
export type CallState = "connecting" | "connected" | "ended";

export class CallSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;

  constructor(
    private iceServers: RTCIceServer[],
    private onState: (s: CallState) => void,
  ) {}

  /** Crea la answer (ICE no-trickle) a partir del offer remoto. */
  async answer(offerSdp: string): Promise<string> {
    this.onState("connecting");
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    pc.ontrack = (e) => {
      this.remoteStream = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.onState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.onState("ended");
    };
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitIceComplete(pc);
    return pc.localDescription!.sdp;
  }

  private waitIceComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
      // Tope de seguridad: no esperar para siempre.
      setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }, 3000);
    });
  }

  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled; // true = muteado
  }

  hangup(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.pc = null;
    this.onState("ended");
  }
}
```

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint`
Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/_components/call-session.ts"
git commit -m "feat(llamadas): CallSession (RTCPeerConnection, answer no-trickle, mute, hangup)"
```

---

## Task 7: Widget `call-panel.tsx` + montaje en layout

**Files:**
- Create: `src/app/(app)/_components/call-panel.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Delete (reemplazado): `src/app/(app)/_components/incoming-call-poller.tsx`

- [ ] **Step 1: Implementar el panel**

Crea `src/app/(app)/_components/call-panel.tsx`. Hace el polling (reemplaza a `IncomingCallPoller`), gestiona la `CallSession` y renderiza la UI entrante/activa. Reusa el `beep()` (cópialo aquí).

```tsx
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
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // Polling de llamadas entrantes (solo si estamos idle)
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.hidden || state !== "idle") return;
      try {
        const ringing = await pollRingingCallsAction();
        if (cancelled) return;
        const fresh = ringing.find((c) => !seen.current.has(c.id));
        if (fresh) {
          seen.current.add(fresh.id);
          beep();
          setIncoming(fresh);
        }
      } catch {
        /* reintenta */
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

  async function onAccept() {
    if (!incoming) return;
    const [ice, offer] = await Promise.all([getIceServersAction(), getCallOfferAction(incoming.id)]);
    if ("error" in offer) {
      setIncoming(null);
      return;
    }
    const cs = new CallSession(ice, (s) => setState(s));
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
    if (incoming) await terminateCallAction(incoming.id);
    session.current?.hangup();
    reset();
  }

  function onToggleMute() {
    setMuted(session.current?.toggleMute() ?? false);
  }

  function reset() {
    setIncoming(null);
    setState("idle");
    setMuted(false);
    setSeconds(0);
    session.current = null;
  }

  // Adjuntar stream remoto cuando exista
  useEffect(() => {
    if (state === "connected" && audioEl.current && session.current?.remoteStream) {
      audioEl.current.srcObject = session.current.remoteStream;
    }
    if (state === "ended") reset();
  }, [state]);

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
              onClick={onAccept}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <PhoneIcon className="size-4" /> Atender
            </button>
            <button
              onClick={onReject}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              <PhoneOffIcon className="size-4" /> Rechazar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onToggleMute}
              aria-pressed={muted}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              {muted ? <MicOffIcon className="size-4" /> : <MicIcon className="size-4" />}
              {muted ? "Activar" : "Silenciar"}
            </button>
            <button
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
```

- [ ] **Step 2: Montar en el layout y quitar el poller viejo**

En `src/app/(app)/layout.tsx`: reemplaza el import `import { IncomingCallPoller } from "./_components/incoming-call-poller";` por `import { CallPanel } from "./_components/call-panel";`, y la línea `<IncomingCallPoller />` por `<CallPanel />`.

- [ ] **Step 3: Borrar el componente reemplazado**

Run: `git rm "src/app/(app)/_components/incoming-call-poller.tsx"`
(El polling y el beep ahora viven en `CallPanel`.)

- [ ] **Step 4: Verificar typecheck + lint + tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint ; bun run test`
Expected: limpio; todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/_components/call-panel.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat(llamadas): CallPanel — atender/rechazar/colgar/silenciar con audio WebRTC"
```

---

## Task 8: Provisionar coturn en vps-prod-01 (ops, sin código de app)

**Files:** ninguno en el repo (config de servidor). Documentar en el commit/PR.

- [ ] **Step 1: Instalar y configurar coturn**

SSH a `root@158.220.123.213`. Instalar coturn y configurar `/etc/turnserver.conf` con:
```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=<TURN_SECRET>
realm=luladev.com
total-quota=100
min-port=49152
max-port=49252
cert=/ruta/al/fullchain.pem
pkey=/ruta/al/privkey.pem
```
Habilitar el servicio (`systemctl enable --now coturn`) y abrir en firewall UDP/TCP 3478, 5349 y el rango relay 49152-49252/udp.

- [ ] **Step 2: Setear env en producción**

En `/opt/wa-blast/.env.local` añadir `TURN_URL=turn:turn.luladev.com:3478` (o el dominio/IP del coturn) y `TURN_SECRET=<mismo secret>`. (Sin estos, la app cae a STUN-only automáticamente.)

- [ ] **Step 3: Verificar TURN**

Probar con la herramienta de Trickle ICE de WebRTC (https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) usando `turn:turn.luladev.com:3478` + credenciales generadas con el secret. Expected: aparece un candidato `relay`.

---

# FASE 2b — Grabación (separable; el núcleo ya funciona sin esto)

## Task 9: Grabación client-side + upload + reproducción

**Files:**
- Modify: `src/app/(app)/_components/call-session.ts` (añadir grabación)
- Create: `src/app/api/calls/[callId]/recording/route.ts`
- Modify: `src/app/(app)/llamadas/page.tsx`, `src/app/(app)/inbox/[id]/_components/call-entry.tsx`

- [ ] **Step 1: Grabar en `CallSession`**

En `src/app/(app)/_components/call-session.ts`, añade campos y lógica de grabación. Tras `remoteStream: MediaStream | null = null;` añade:

```ts
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
```

Al final de `answer(...)`, justo antes de `return pc.localDescription!.sdp;`, inicia la grabación mezclando local + remoto:

```ts
    try {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (this.localStream) ctx.createMediaStreamSource(this.localStream).connect(dest);
      pc.ontrack = (e) => {
        this.remoteStream = e.streams[0];
        ctx.createMediaStreamSource(e.streams[0]).connect(dest);
      };
      this.recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus" });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.start();
    } catch {
      /* grabación no disponible: la llamada sigue */
    }
```

Añade un método para detener y obtener el blob:

```ts
  stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: "audio/webm" }));
      rec.stop();
    });
  }
```

Y en `hangup()`, antes de `this.pc?.close();`, deja de capturar (el blob se obtiene desde el panel antes de llamar hangup, ver Step 2).

- [ ] **Step 2: Subir el blob al colgar (en `CallPanel`)**

En `src/app/(app)/_components/call-panel.tsx`, cambia `onHangup` para obtener el blob y subirlo:

```ts
  async function onHangup() {
    if (incoming) await terminateCallAction(incoming.id);
    const blob = (await session.current?.stopRecording()) ?? null;
    if (blob && incoming) {
      await fetch(`/api/calls/${incoming.id}/recording`, { method: "POST", body: blob, headers: { "content-type": "audio/webm" } });
    }
    session.current?.hangup();
    reset();
  }
```

- [ ] **Step 3: Route handler de upload**

Crea `src/app/api/calls/[callId]/recording/route.ts`:

```ts
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getCallById, setRecordingMediaId } from "@/lib/calls/store";
import { saveMediaAsset } from "@/lib/media/store";

export async function POST(req: Request, { params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return new Response("not found", { status: 404 });
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) return new Response("empty", { status: 400 });
  const asset = await saveMediaAsset(db, { orgId, bytes, mime: "audio/webm", kind: "audio" });
  await setRecordingMediaId(db, orgId, callId, asset.id);
  return Response.json({ ok: true, mediaId: asset.id });
}
```

- [ ] **Step 4: Reproducir en `/llamadas` y en el hilo**

En `src/app/(app)/llamadas/page.tsx`, dentro del bloque de cada llamada (`group.items.map`), tras el `<div>` de duración/fecha, si el registro tiene `recordingMediaId` añade un reproductor. Como `listCalls` no trae ese campo, amplía el `select` de `listCalls` en `src/lib/calls/store.ts` con `recordingMediaId: calls.recordingMediaId,` y su tipo en `CallListItem` (`recordingMediaId: string | null;`). Luego en la fila:

```tsx
                      {call.recordingMediaId && (
                        <audio controls preload="none" src={`/media/${call.recordingMediaId}`} className="h-8" />
                      )}
```

(`/media/[id]` ya es la ruta pública de media del proyecto.)

En `src/app/(app)/inbox/[id]/_components/call-entry.tsx`, si la llamada tiene `recordingMediaId`, renderiza el mismo `<audio controls src={`/media/${recordingMediaId}`} />` bajo la etiqueta de la llamada. (Confirmar que `getThread`/`getCallsForConversation` ya devuelven la fila completa de `calls`, que incluye `recordingMediaId`; `getCallsForConversation` hace `select()` completo, así que sí.)

- [ ] **Step 5: Verificar typecheck + lint + tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint ; bun run test`
Expected: limpio; tests verdes.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/_components/call-session.ts" "src/app/(app)/_components/call-panel.tsx" "src/app/api/calls/[callId]/recording/route.ts" "src/app/(app)/llamadas/page.tsx" "src/app/(app)/inbox/[id]/_components/call-entry.tsx" src/lib/calls/store.ts
git commit -m "feat(llamadas): grabación client-side (MediaRecorder) + upload + reproducción"
```

---

## Task 10: Verificación final + review + deploy

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite completa**

Run: `bun run lint && npx tsc --noEmit 2>&1 | grep -E "^src/" && bun run test`
Expected: lint limpio, sin errores en `src/`, todos los tests verdes.

- [ ] **Step 2: Code review**

Dispara `code-reviewer` sobre `git diff main...HEAD`. Resolver hallazgos bloqueantes.

- [ ] **Step 3: Deploy + provisión coturn**

Merge a `main`, `bash deploy/deploy.sh` (aplica mig 0011), y completar Task 8 (coturn + env en prod).

- [ ] **Step 4: Verificación manual con número de PRODUCCIÓN**

Llamada real entrante de WhatsApp → aparece el CallPanel → **Atender** → audio bidireccional audible → **Silenciar** corta el mic → **Colgar** → en `/llamadas` la llamada queda `completed` con duración y (si Fase 2b) con reproductor de la grabación. Probar también **Rechazar** (queda `rejected`).

---

## Self-Review

- **Cobertura del spec:**
  - Flujo atender (getUserMedia, offer de DB, answer no-trickle, accept) → Tasks 5, 6, 7. ✔
  - acceptCall/rejectCall/terminateCall (POST /calls v24) → Task 2. ✔
  - getIceServers credencial efímera coturn + fallback STUN → Tasks 4, 5. ✔
  - Estado `connected` + `answeredAt`, terminate cierra connected → Task 3. ✔
  - call-session.ts (RTCPeerConnection, mute, hangup) → Task 6. ✔
  - call-panel.tsx (UI entrante/activa, cronómetro, integra poller) + montaje → Task 7. ✔
  - coturn en VPS + env → Tasks 1, 8. ✔
  - Grabación client-side + upload + reproducción → Task 9. ✔
  - Verificación unit + manual con número producción → Task 10. ✔
- **Sin placeholders:** todos los steps con código muestran código real y comandos con salida esperada. Task 8 (ops) y la verificación manual (Task 10) son inherentemente no-código y están descritas con pasos concretos.
- **Consistencia de tipos/nombres:** `callAction`/`acceptCall`/`rejectCall`/`terminateCall` (Task 2) ↔ server actions (Task 5). `buildIceServers` firma (Task 4) ↔ uso en `getIceServersAction` (Task 5). `getCallById`/`markCallConnected`/`markCallRejected`/`setRecordingMediaId` (Task 3) ↔ server actions (Task 5) y route handler (Task 9). `CallSession.answer/toggleMute/hangup/stopRecording/remoteStream` (Tasks 6, 9) ↔ uso en `CallPanel` (Tasks 7, 9). Columnas `answeredAt`/`recordingMediaId` (Task 3) ↔ `markCallConnected`/`setRecordingMediaId`/`listCalls` (Tasks 3, 9).
