# WhatsApp Calling — Fase 3: Salientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un agente humano inicie una llamada saliente de WhatsApp a un contacto desde la app, con el ciclo completo de permiso de llamada y audio WebRTC navegador↔Meta.

**Architecture:** Invierte el flujo de Fase 2: el navegador crea el SDP offer y lo manda en `POST /{phoneId}/calls` action `connect`; el answer del usuario llega por webhook y se persiste en la fila `calls`, donde el `CallPanel` lo recoge por polling y lo aplica. Antes de poder llamar, se exige permiso (mensaje interactivo `call_permission_request`; la respuesta llega por webhook y se guarda en el contacto). La llamada activa reutiliza `CallSession`/`CallPanel` de Fase 2.

**Tech Stack:** Next.js 15 (App Router, server actions, route handlers), WebRTC, Drizzle/SQLite, Vitest, Bun.

---

## File Structure

- `src/lib/db/schema/domain.ts` — `contacts.callPermissionStatus/callPermissionExpiresAt` + `calls.answerSdp` (modify).
- `drizzle/migrations/0012_*.sql` — generada (create).
- `src/lib/calls/store.ts` — `markCallPermission`, `getContactCallPermission`, `setCallAnswer`, `getCallAnswer`, `createOutboundCall` (modify).
- `src/lib/meta/calling.ts` — `requestCallPermission`, `placeCall` (modify).
- `src/lib/meta/webhook.ts` — schema del answer (reusa `session`) + reply de permiso (modify).
- `src/lib/meta/webhook-handlers.ts` — persistir answer en `out`; `handleCallPermissionReply` (modify).
- `src/app/api/webhook/meta/route.ts` — invocar `handleCallPermissionReply` (modify).
- `src/app/(app)/llamadas/actions.ts` — `requestCallPermissionAction`, `getCallPermissionAction`, `placeCallAction`, `getCallAnswerAction` (modify).
- `src/app/(app)/_components/call-session.ts` — `offer()`, `applyAnswer()` (modify).
- `src/app/(app)/_components/call-panel.tsx` — estado `outgoing` + listener del evento de inicio (modify).
- `src/app/(app)/_components/call-button.tsx` — botón "Llamar" reutilizable (create).
- `src/app/(app)/inbox/[id]/_components/contact-panel.tsx`, `src/app/(app)/contactos/[id]/_ficha.tsx` — montar `<CallButton>` (modify).
- Tests: `tests/unit/calling-actions.test.ts`, `tests/unit/calls-store.test.ts`, `tests/unit/webhook-call.test.ts` (modify).

---

## Task 1: Migración 0012 — permiso en contactos + answerSdp en calls

**Files:**
- Modify: `src/lib/db/schema/domain.ts` (tablas `contacts` y `calls`)
- Create: `drizzle/migrations/0012_*.sql`

- [ ] **Step 1: Añadir columnas al schema**

En `contacts`, tras `city: text("city"),`:

```ts
    callPermissionStatus: text("call_permission_status", { enum: ["temporary", "permanent"] }),
    callPermissionExpiresAt: integer("call_permission_expires_at", { mode: "timestamp" }),
```

En `calls`, tras `sdpType: text("sdp_type"),`:

```ts
    answerSdp: text("answer_sdp"),
```

- [ ] **Step 2: Generar migración**

Run: `bunx drizzle-kit generate`
Expected: `0012_*.sql` con 3 `ALTER TABLE ... ADD`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/"`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations
git commit -m "feat(salientes): permiso de llamada en contacts + answerSdp en calls (mig 0012)"
```

---

## Task 2: Helpers de store (permiso, answer, fila saliente)

**Files:**
- Modify: `src/lib/calls/store.ts`
- Test: `tests/unit/calls-store.test.ts`

- [ ] **Step 1: Tests que fallan**

En `tests/unit/calls-store.test.ts` añade al import de `@/lib/calls/store`: `createOutboundCall, getCallAnswer, getContactCallPermission, markCallPermission, setCallAnswer`. Importa también `contacts` desde `@/lib/db/schema` (ya importado `calls, conversations, organization`; añade `contacts`). Añade tests:

```ts
  it("markCallPermission + getContactCallPermission: temporal vigente vs expirado", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "+57300", customFields: "{}", createdAt: new Date(), updatedAt: new Date() });
    await markCallPermission(db, "o1", "ct1", "temporary", new Date(Date.now() + 60_000));
    let p = await getContactCallPermission(db, "o1", "ct1");
    expect(p.valid).toBe(true);
    await markCallPermission(db, "o1", "ct1", "temporary", new Date(Date.now() - 60_000));
    p = await getContactCallPermission(db, "o1", "ct1");
    expect(p.valid).toBe(false);
    await markCallPermission(db, "o1", "ct1", "permanent", null);
    p = await getContactCallPermission(db, "o1", "ct1");
    expect(p.valid).toBe(true);
  });
  it("createOutboundCall inserta out/ringing; setCallAnswer/getCallAnswer", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const id = await createOutboundCall(db, { orgId: "o1", conversationId: "c1", phone: "+57300", wacid: "out1" });
    const row = (await db.select().from(calls).where(eq(calls.id, id)))[0];
    expect(row.direction).toBe("out");
    expect(row.status).toBe("ringing");
    await setCallAnswer(db, "o1", id, "v=0 answer");
    expect(await getCallAnswer(db, "o1", id)).toBe("v=0 answer");
  });
```

- [ ] **Step 2: Run — debe fallar**

Run: `bun run test -- calls-store`
Expected: FAIL (funciones no existen).

- [ ] **Step 3: Implementar en store.ts**

Añade `contacts` al import `from "@/lib/db/schema"` (junto a `calls, conversations`). Al final del archivo:

```ts
export async function markCallPermission(
  db: DB,
  orgId: string,
  contactId: string,
  status: "temporary" | "permanent",
  expiresAt: Date | null,
): Promise<void> {
  await db
    .update(contacts)
    .set({ callPermissionStatus: status, callPermissionExpiresAt: expiresAt, updatedAt: new Date() })
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
}

export async function getContactCallPermission(
  db: DB,
  orgId: string,
  contactId: string,
): Promise<{ status: "temporary" | "permanent" | null; expiresAt: Date | null; valid: boolean }> {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  const status = c?.callPermissionStatus ?? null;
  const expiresAt = c?.callPermissionExpiresAt ?? null;
  const valid = status === "permanent" || (status === "temporary" && !!expiresAt && expiresAt.getTime() > Date.now());
  return { status, expiresAt, valid };
}

export async function createOutboundCall(
  db: DB,
  e: { orgId: string; conversationId: string; phone: string; wacid: string },
): Promise<string> {
  const id = randomUUID();
  await db.insert(calls).values({
    id,
    orgId: e.orgId,
    conversationId: e.conversationId,
    phone: e.phone,
    direction: "out",
    status: "ringing",
    wacid: e.wacid,
    startedAt: new Date(),
    createdAt: new Date(),
  });
  return id;
}

export async function setCallAnswer(db: DB, orgId: string, id: string, sdp: string): Promise<void> {
  await db.update(calls).set({ answerSdp: sdp }).where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
}

export async function getCallAnswer(db: DB, orgId: string, id: string): Promise<string | null> {
  const [row] = await db.select().from(calls).where(and(eq(calls.orgId, orgId), eq(calls.id, id)));
  return row?.answerSdp ?? null;
}
```

- [ ] **Step 4: Run — debe pasar**

Run: `bun run test -- calls-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calls/store.ts tests/unit/calls-store.test.ts
git commit -m "feat(salientes): helpers de store (permiso, answer SDP, fila saliente)"
```

---

## Task 3: Cliente Meta — requestCallPermission + placeCall

**Files:**
- Modify: `src/lib/meta/calling.ts`
- Test: `tests/unit/calling-actions.test.ts`

- [ ] **Step 1: Tests que fallan**

En `tests/unit/calling-actions.test.ts` añade al import: `placeCall, requestCallPermission`. Añade:

```ts
  it("requestCallPermission postea mensaje interactivo call_permission_request", async () => {
    const fetchFn = mockFetchOk();
    const res = await requestCallPermission(s, "+57300");
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/PID/messages");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("+57300");
    expect(body.type).toBe("interactive");
    expect(body.interactive.type).toBe("call_permission_request");
  });
  it("placeCall postea action connect con offer y devuelve callId", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ calls: [{ id: "CID-OUT" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const res = await placeCall(s, "v=0 offer", "+57300");
    expect(res).toEqual({ ok: true, callId: "CID-OUT" });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe("connect");
    expect(body.to).toBe("+57300");
    expect(body.session).toEqual({ sdp: "v=0 offer", sdp_type: "offer" });
  });
```

- [ ] **Step 2: Run — debe fallar**

Run: `bun run test -- calling-actions`
Expected: FAIL.

- [ ] **Step 3: Implementar en calling.ts**

Al final del archivo:

```ts
export async function requestCallPermission(
  s: DecryptedSettings,
  toPhone: string,
): Promise<{ ok: true } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) return { error: "Meta no configurado" };
  const res = await fetch(`${GRAPH}/${s.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      type: "interactive",
      interactive: { type: "call_permission_request" },
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "No se pudo solicitar permiso" };
  }
  return { ok: true };
}

export async function placeCall(
  s: DecryptedSettings,
  offerSdp: string,
  toPhone: string,
): Promise<{ ok: true; callId: string } | { error: string }> {
  if (!s.metaPhoneId || !s.metaAccessToken) return { error: "Meta no configurado" };
  const res = await fetch(`${GRAPH_CALLS}/${s.metaPhoneId}/calls`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to: toPhone, action: "connect", session: { sdp: offerSdp, sdp_type: "offer" } }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { error: j.error?.message ?? "No se pudo iniciar la llamada" };
  }
  const j = (await res.json()) as { calls?: { id: string }[] };
  const callId = j.calls?.[0]?.id;
  if (!callId) return { error: "Meta no devolvió id de llamada" };
  return { ok: true, callId };
}
```

- [ ] **Step 4: Run — debe pasar**

Run: `bun run test -- calling-actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta/calling.ts tests/unit/calling-actions.test.ts
git commit -m "feat(salientes): requestCallPermission + placeCall (connect con offer)"
```

---

## Task 4: Webhook — answer SDP saliente + reply de permiso

**Files:**
- Modify: `src/lib/meta/webhook.ts`, `src/lib/meta/webhook-handlers.ts`, `src/app/api/webhook/meta/route.ts`
- Test: `tests/unit/webhook-call.test.ts`

NOTA de contrato externo: la forma exacta del reply de permiso de Meta se
verifica contra la doc al implementar. Este plan asume que llega como un item de
`messages[]` con `type: "interactive"` e `interactive.type` que contiene
`"call_permission"` y un objeto con `response` y `expiration_timestamp`. El
parser es tolerante (passthrough) para no romper si difiere.

- [ ] **Step 1: Test que falla — answer saliente se persiste**

En `tests/unit/webhook-call.test.ts` añade:

```ts
  it("answer de una llamada saliente persiste answerSdp", async () => {
    const { db } = makeTestDb();
    await seed(db);
    // simula una saliente ya creada
    const { createOutboundCall } = await import("@/lib/calls/store");
    const { getOrCreateConversation } = await import("@/lib/inbox/store");
    const conv = await getOrCreateConversation(db, "o1", "+57305", new Date());
    await createOutboundCall(db, { orgId: "o1", conversationId: conv.id, phone: "+57305", wacid: "wacid.OUT" });
    const payload: CallPayload = {
      id: "wacid.OUT",
      to: "57305",
      event: "connect",
      direction: "BUSINESS_INITIATED",
      session: { sdp: "v=0 answer-remoto", sdp_type: "answer" },
    };
    await handleCallEvent(db, "o1", payload);
    const rows = await db.select().from(calls).where(eq(calls.wacid, "wacid.OUT"));
    expect(rows[0].answerSdp).toBe("v=0 answer-remoto");
  });
```

- [ ] **Step 2: Run — debe fallar**

Run: `bun run test -- webhook-call`
Expected: FAIL (no se persiste answerSdp).

- [ ] **Step 3: Persistir el answer en handleCallEvent**

En `src/lib/meta/webhook-handlers.ts`, dentro de `handleCallEvent`, después de `const conv = await getOrCreateConversation(...)` y antes del `recordCallEvent`, añade: si la llamada es saliente y trae `session.sdp_type === "answer"`, persistir el answer en la fila existente por `wacid`:

```ts
  if (direction === "out" && call.session?.sdp && call.session?.sdp_type === "answer") {
    const { calls } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const existing = (await db.select().from(calls).where(and(eq(calls.orgId, orgId), eq(calls.wacid, call.id))))[0];
    if (existing) {
      await db.update(calls).set({ answerSdp: call.session.sdp }).where(eq(calls.id, existing.id));
    }
  }
```

(El `recordCallEvent` posterior sigue registrando connect/terminate como hasta ahora.)

- [ ] **Step 4: Run — debe pasar**

Run: `bun run test -- webhook-call`
Expected: PASS.

- [ ] **Step 5: Reply de permiso — handler + dispatch**

En `src/lib/meta/webhook-handlers.ts` añade:

```ts
export async function handleCallPermissionReply(
  db: DB,
  orgId: string,
  reply: { fromPhone: string; response: string; expirationTs?: number },
) {
  const { getOrCreateConversation } = await import("@/lib/inbox/store");
  const { markCallPermission } = await import("@/lib/calls/store");
  const phone = "+" + reply.fromPhone.replace(/^\+/, "");
  const conv = await getOrCreateConversation(db, orgId, phone, new Date());
  if (!conv.contactId) return;
  const accepted = reply.response.toLowerCase().includes("accept");
  if (!accepted) {
    await markCallPermission(db, orgId, conv.contactId, "temporary", new Date(0));
    return;
  }
  // accept: con expiración → temporary; sin expiración → permanent
  if (reply.expirationTs) {
    await markCallPermission(db, orgId, conv.contactId, "temporary", new Date(reply.expirationTs * 1000));
  } else {
    await markCallPermission(db, orgId, conv.contactId, "permanent", null);
  }
}
```

En `src/app/api/webhook/meta/route.ts`, dentro del loop de `v.messages` (o donde Meta entregue el reply), detecta el reply de permiso y despacha. Añade tras el bloque `if (v.messages) {...}` un parseo tolerante:

```ts
      if (v.messages) {
        for (const m of v.messages as Array<Record<string, unknown>>) {
          const inter = m.interactive as { type?: string; call_permission_reply?: { response?: string; expiration_timestamp?: number } } | undefined;
          const reply = inter?.call_permission_reply;
          if (inter?.type?.includes("call_permission") && reply?.response) {
            await handleCallPermissionReply(db, settings.orgId, {
              fromPhone: String(m.from ?? ""),
              response: reply.response,
              expirationTs: reply.expiration_timestamp,
            });
          }
        }
      }
```

Importa `handleCallPermissionReply` en el `import ... from "@/lib/meta/webhook-handlers"`. Mantén el `for (const m of v.messages) await handleInboundMessage(...)` existente (el reply de permiso no es un mensaje de chat normal; si Meta lo entrega como mensaje, handleInboundMessage lo ignorará por tipo desconocido — verificar que no cree ruido; si lo crea, saltar los items con `interactive?.type` de permiso antes de `handleInboundMessage`).

- [ ] **Step 6: Verificar typecheck + tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run test -- webhook-call calls-store`
Expected: limpio; verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/meta/webhook-handlers.ts src/app/api/webhook/meta/route.ts tests/unit/webhook-call.test.ts
git commit -m "feat(salientes): persistir answer SDP + reply de permiso de llamada en webhook"
```

---

## Task 5: Server actions de salientes

**Files:**
- Modify: `src/app/(app)/llamadas/actions.ts`

- [ ] **Step 1: Implementar**

Añade imports y acciones (reusa `db`, `requireOrg`, `getOrgSettings`, `getCallById`):

```ts
import { requestCallPermission, placeCall } from "@/lib/meta/calling";
import {
  createOutboundCall,
  getCallAnswer,
  getContactCallPermission,
  markCallPermission,
} from "@/lib/calls/store";
import { getOrCreateConversation } from "@/lib/inbox/store";
import { contacts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function getCallPermissionAction(contactId: string) {
  const { orgId } = await requireOrg();
  return getContactCallPermission(db, orgId, contactId);
}

export async function requestCallPermissionAction(contactId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  if (!c) return { error: "Contacto no encontrado" };
  const settings = await getOrgSettings(db, orgId);
  return requestCallPermission(settings, c.phone);
}

export async function placeCallAction(
  contactId: string,
  offerSdp: string,
): Promise<{ ok: true; callId: string; conversationId: string } | { error: string }> {
  const { orgId } = await requireOrg();
  const perm = await getContactCallPermission(db, orgId, contactId);
  if (!perm.valid) return { error: "Sin permiso de llamada vigente" };
  const [c] = await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  if (!c) return { error: "Contacto no encontrado" };
  const settings = await getOrgSettings(db, orgId);
  const conv = await getOrCreateConversation(db, orgId, c.phone, new Date());
  const res = await placeCall(settings, offerSdp, c.phone);
  if ("error" in res) return res;
  const id = await createOutboundCall(db, { orgId, conversationId: conv.id, phone: c.phone, wacid: res.callId });
  return { ok: true, callId: id, conversationId: conv.id };
}

export async function getCallAnswerAction(callId: string): Promise<{ sdp: string } | { pending: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  if (!call.answerSdp) return { pending: true };
  return { sdp: call.answerSdp };
}
```

(Nota: `markCallPermission` se importa para mantener el grupo de imports de store coherente aunque no se use directamente aquí; si el linter marca import sin usar, quítalo.)

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint`
Expected: limpio. (Si `markCallPermission` queda sin usar, elimínalo del import.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/llamadas/actions.ts"
git commit -m "feat(salientes): server actions permiso/place/answer"
```

---

## Task 6: CallSession — offer() + applyAnswer()

**Files:**
- Modify: `src/app/(app)/_components/call-session.ts`

- [ ] **Step 1: Refactor + añadir métodos**

`offer()` comparte casi todo con `answer()` (getUserMedia, pc, grabación, ICE wait). Extrae la preparación común a un helper privado `setupPc()` que crea `pc`, pide el mic, añade tracks, configura `ontrack`/grabación/`onconnectionstatechange`. Refactoriza `answer(offerSdp)` para usarlo y añade `offer()` y `applyAnswer()`:

```ts
  private async setupPc(): Promise<RTCPeerConnection> {
    this.onState("connecting");
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    let recordCtx: AudioContext | null = null;
    let recordDest: MediaStreamAudioDestinationNode | null = null;
    try {
      recordCtx = new AudioContext();
      recordDest = recordCtx.createMediaStreamDestination();
      recordCtx.createMediaStreamSource(this.localStream).connect(recordDest);
    } catch {
      recordCtx = null;
    }
    pc.ontrack = (e) => {
      this.remoteStream = e.streams[0];
      if (recordCtx && recordDest) {
        try {
          recordCtx.createMediaStreamSource(e.streams[0]).connect(recordDest);
        } catch {
          /* grabación remota no disponible */
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.onState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.onState("ended");
    };
    this.recordDest = recordDest;
    return pc;
  }

  private startRecording() {
    if (!this.recordDest) return;
    try {
      this.recorder = new MediaRecorder(this.recordDest.stream, { mimeType: "audio/webm;codecs=opus" });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.start();
    } catch {
      this.recorder = null;
    }
  }

  async answer(offerSdp: string): Promise<string> {
    const pc = await this.setupPc();
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const a = await pc.createAnswer();
    await pc.setLocalDescription(a);
    await this.waitIceComplete(pc);
    if (!pc.localDescription) throw new Error("No se generó la descripción local (answer)");
    this.startRecording();
    return pc.localDescription.sdp;
  }

  async offer(): Promise<string> {
    const pc = await this.setupPc();
    const o = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(o);
    await this.waitIceComplete(pc);
    if (!pc.localDescription) throw new Error("No se generó la descripción local (offer)");
    this.startRecording();
    return pc.localDescription.sdp;
  }

  async applyAnswer(answerSdp: string): Promise<void> {
    if (!this.pc) throw new Error("Sin conexión activa");
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }
```

Declara el campo `private recordDest: MediaStreamAudioDestinationNode | null = null;` junto a `recorder`/`chunks`. Elimina la construcción inline de `recorder` del antiguo `answer()` (ahora la hace `startRecording`).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint`
Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/_components/call-session.ts"
git commit -m "feat(salientes): CallSession.offer() + applyAnswer() (setupPc compartido)"
```

---

## Task 7: CallPanel — estado outgoing + inicio por evento

**Files:**
- Modify: `src/app/(app)/_components/call-panel.tsx`

- [ ] **Step 1: Escuchar el evento de inicio y manejar saliente**

Añade el tipo de detalle del evento y, dentro del componente, un `useEffect` que escucha `window` para `lula:place-call` y arranca la saliente. Añade el estado `outgoing` y el poll del answer. Inserta tras el efecto del cronómetro:

```tsx
  // Inicio de llamada saliente disparado por los botones "Llamar"
  useEffect(() => {
    async function onPlace(ev: Event) {
      const detail = (ev as CustomEvent<{ contactId: string; name?: string; phone?: string }>).detail;
      if (state !== "idle") return;
      setIncoming({ id: "", phone: detail.phone ?? "", contactName: detail.name ?? null, conversationId: "" });
      setState("connecting");
      const ice = await getIceServersAction();
      const cs = new CallSession(ice as RTCIceServer[], (s) => {
        setState(s);
        if (s === "ended") reset();
      });
      session.current = cs;
      let offerSdp: string;
      try {
        offerSdp = await cs.offer();
      } catch (err) {
        console.error("No se pudo iniciar el audio saliente", err);
        cs.hangup();
        reset();
        return;
      }
      const res = await placeCallAction(detail.contactId, offerSdp);
      if ("error" in res) {
        console.error("placeCall falló", res.error);
        cs.hangup();
        reset();
        return;
      }
      setIncoming({ id: res.callId, phone: detail.phone ?? "", contactName: detail.name ?? null, conversationId: res.conversationId });
      // Poll del answer hasta que el usuario conteste
      const poll = setInterval(async () => {
        const ans = await getCallAnswerAction(res.callId);
        if ("sdp" in ans) {
          clearInterval(poll);
          await session.current?.applyAnswer(ans.sdp);
          if (audioEl.current && session.current?.remoteStream) audioEl.current.srcObject = session.current.remoteStream;
        }
      }, 2000);
      // Cortar el poll si la llamada termina
      pollRef.current = poll;
    }
    window.addEventListener("lula:place-call", onPlace as EventListener);
    return () => window.removeEventListener("lula:place-call", onPlace as EventListener);
  }, [state]);
```

Añade el import de `placeCallAction` y `getCallAnswerAction` a la lista de `../llamadas/actions`. Declara `const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);` junto a los demás refs, y en `reset()` añade `if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }`.

- [ ] **Step 2: Mostrar "Llamando…" en estado connecting saliente**

El render ya muestra "Llamada entrante…" en `connecting`. Diferencia entrante/saliente con un flag. Añade estado `const [isOutbound, setIsOutbound] = useState(false);`, ponlo `true` al inicio de `onPlace` y `false` en `reset()`. En el texto de estado, cuando `connecting`:

```tsx
        {state === "connecting"
          ? isOutbound
            ? "Llamando…"
            : "Conectando…"
          : state === "connected"
            ? `En llamada · ${mm}:${ss}`
            : state === "idle"
              ? "Llamada entrante…"
              : "Finalizando…"}
```

En estado `connecting` saliente, los botones deben ser solo **Colgar** (cancelar). El bloque de botones: cuando `state !== "idle"` ya muestra Silenciar+Colgar; está bien para saliente (silenciar antes de conectar es inocuo). Para `idle` (entrante) se mantienen Atender/Rechazar.

- [ ] **Step 3: Typecheck + lint + tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint ; bun run test`
Expected: limpio; verde.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/_components/call-panel.tsx"
git commit -m "feat(salientes): CallPanel estado outgoing + inicio por evento lula:place-call + poll del answer"
```

---

## Task 8: Botón "Llamar" reutilizable + montaje

**Files:**
- Create: `src/app/(app)/_components/call-button.tsx`
- Modify: `src/app/(app)/inbox/[id]/_components/contact-panel.tsx`, `src/app/(app)/contactos/[id]/_ficha.tsx`

- [ ] **Step 1: Componente CallButton**

Crea `src/app/(app)/_components/call-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PhoneIcon } from "lucide-react";
import { toast } from "sonner";
import { getCallPermissionAction, requestCallPermissionAction } from "../llamadas/actions";

export function CallButton({
  contactId,
  name,
  phone,
  className,
}: {
  contactId: string;
  name?: string | null;
  phone?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const perm = await getCallPermissionAction(contactId);
      if (perm.valid) {
        window.dispatchEvent(
          new CustomEvent("lula:place-call", { detail: { contactId, name, phone } }),
        );
        return;
      }
      const res = await requestCallPermissionAction(contactId);
      if ("error" in res) {
        toast.error(`No se pudo pedir permiso: ${res.error}`);
      } else {
        toast(
          "📞 Permiso de llamada solicitado",
          { description: "Te avisamos cuando el contacto acepte; entonces podrás llamar." },
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      }
    >
      <PhoneIcon className="size-4" /> Llamar
    </button>
  );
}
```

- [ ] **Step 2: Montar en el panel de contacto del inbox**

En `src/app/(app)/inbox/[id]/_components/contact-panel.tsx`, importa `import { CallButton } from "../../_components/call-button";` y renderiza `<CallButton contactId={...} name={...} phone={...} />` en la cabecera del panel (junto al nombre/acciones del contacto). Usa las props de contacto que el panel ya recibe (`contactId`, `name`/`contactName`, `phone`). Si el panel no recibe `contactId`, añádelo a sus props y pásalo desde el padre (`thread-and-composer.tsx` o `page.tsx`).

- [ ] **Step 3: Montar en la ficha de contacto**

En `src/app/(app)/contactos/[id]/_ficha.tsx`, importa `CallButton` y colócalo en la cabecera de la ficha (junto al nombre), pasando `contactId={contact.id}`, `name={contact.name}`, `phone={contact.phone}`.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/_components/call-button.tsx" "src/app/(app)/inbox/[id]/_components/contact-panel.tsx" "src/app/(app)/contactos/[id]/_ficha.tsx"
git commit -m "feat(salientes): botón Llamar reutilizable en inbox y ficha de contacto"
```

---

## Task 8b: "Nueva llamada" en /llamadas (selector de contacto)

**Files:**
- Create: `src/app/(app)/llamadas/_nueva-llamada.tsx`
- Modify: `src/app/(app)/llamadas/page.tsx`

- [ ] **Step 1: Componente cliente con buscador**

Crea `src/app/(app)/llamadas/_nueva-llamada.tsx`. Usa el `Sheet`/`Dialog` ya presente en el proyecto (el `Sheet` de shadcn existe; reusa `@/components/ui/sheet`). Busca contactos con `listContactsAction` y al elegir uno dispara `lula:place-call` y cierra.

```tsx
"use client";

import { useState } from "react";
import { PhoneIcon, SearchIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { listContactsAction } from "../contactos/actions";

type Row = { id: string; name: string | null; phone: string };

export function NuevaLlamada() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  async function search(q: string) {
    const res = await listContactsAction(q || undefined);
    setRows(res.map((r) => ({ id: r.id, name: r.name, phone: r.phone })));
  }

  function call(r: Row) {
    window.dispatchEvent(
      new CustomEvent("lula:place-call", { detail: { contactId: r.id, name: r.name, phone: r.phone } }),
    );
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (o) void search(""); }}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <PhoneIcon className="size-4" /> Nueva llamada
        </button>
      </SheetTrigger>
      <SheetContent className="px-4">
        <SheetHeader>
          <SheetTitle>Nueva llamada</SheetTitle>
        </SheetHeader>
        <div className="relative my-3">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar contacto…" className="pl-8" onChange={(e) => void search(e.target.value)} />
        </div>
        <div className="space-y-1 overflow-y-auto">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => call(r)}
              className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-muted"
            >
              <span>
                <span className="font-medium">{r.name || r.phone}</span>
                <span className="block text-xs text-muted-foreground">{r.phone}</span>
              </span>
              <PhoneIcon className="size-4 text-muted-foreground" />
            </button>
          ))}
          {rows.length === 0 && <p className="p-2 text-sm text-muted-foreground">Sin contactos</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Montar el botón en /llamadas**

En `src/app/(app)/llamadas/page.tsx`, importa `import { NuevaLlamada } from "./_nueva-llamada";` y colócalo en el header, junto al `<h1>Llamadas</h1>` (envuelve el header en un `flex items-start justify-between` y pon `<NuevaLlamada />` a la derecha).

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "^src/" ; bun run lint`
Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/llamadas/_nueva-llamada.tsx" "src/app/(app)/llamadas/page.tsx"
git commit -m "feat(salientes): Nueva llamada en /llamadas (selector de contacto)"
```

---

## Task 9: Verificación + review + deploy

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite completa**

Run: `bun run lint && npx tsc --noEmit 2>&1 | grep -E "^src/" && bun run test`
Expected: lint limpio, sin errores en `src/`, tests verdes (suben ~6).

- [ ] **Step 2: Code review**

Dispara `code-reviewer` sobre `git diff main...HEAD`. Foco: multi-tenant (acciones validan orgId/permiso), parseo tolerante del webhook de permiso, fugas en el poll del answer (cleanup), carrera idle/connecting al disparar el evento, vigencia del permiso. Resolver bloqueantes.

- [ ] **Step 3: Deploy**

Merge a `main`, `bash deploy/deploy.sh` (aplica mig 0012).

- [ ] **Step 4: Verificación manual con número de PRODUCCIÓN**

Abrir un contacto con conversación reciente → **Llamar** → si pide permiso, aceptar en el teléfono del usuario → **Llamar** otra vez → suena en el teléfono → contestar → audio bidireccional → colgar → `/llamadas` registra la saliente `completed` con duración (+ grabación). Verificar también el botón en la ficha y el caso "sin ventana 24h" (botón pide permiso pero el mensaje no sale → revisar el error que devuelve Meta).

---

## Self-Review

- **Cobertura del spec:**
  - Permiso: request + reply webhook + tracking en contacto → Tasks 3, 4, 2 (helpers), 5 (actions), 8 (botón auto-pide). ✔
  - Iniciar (offer del navegador + connect) → Tasks 3 (placeCall), 6 (offer), 5 (placeCallAction), 7 (CallPanel). ✔
  - Answer por webhook + poll + applyAnswer → Tasks 4 (persist), 5 (getCallAnswerAction), 6 (applyAnswer), 7 (poll). ✔
  - Reutilizar audio/mute/colgar/grabación de Fase 2 → Task 6/7 (CallSession/CallPanel reusados). ✔
  - Migración 0012 (permiso + answerSdp) → Task 1. ✔
  - Botones en hilo/ficha/llamadas → Task 8 (hilo + ficha) + Task 8b (`/llamadas` Nueva llamada). ✔
  - Constraint ventana 24h → reflejado en el manejo de error de `requestCallPermission` (Task 8 muestra el error de Meta) y verificación Task 9 Step 4.
  - Verificación unit + manual → Task 9. ✔
- **Sin placeholders:** los steps con código muestran código real; el único contrato no-verificado (forma del reply de permiso de Meta) está marcado explícitamente con parser tolerante y verificación manual.
- **Consistencia de tipos:** `placeCall(s, offerSdp, toPhone)→{callId}` (T3) ↔ `placeCallAction` (T5). `markCallPermission/getContactCallPermission/createOutboundCall/getCallAnswer/setCallAnswer` (T2) ↔ usos en webhook (T4) y actions (T5). `CallSession.offer()/applyAnswer()` (T6) ↔ uso en CallPanel (T7). Evento `lula:place-call` detail `{contactId,name,phone}` (T7 listener ↔ T8 dispatch). Columnas `callPermissionStatus/callPermissionExpiresAt/answerSdp` (T1) ↔ helpers (T2).
