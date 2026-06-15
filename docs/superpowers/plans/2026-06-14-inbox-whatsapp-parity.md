# Inbox paridad WhatsApp Business — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar el inbox de Lula a paridad con WhatsApp Business — notas de voz, stickers (colección + enviar/recibir), reacciones vinculadas, media saliente visible, auto-guardado de contactos, notas internas, y un rediseño minimal con scroll arreglado.

**Architecture:** Backend primero (schema + libs ffmpeg + stores + cliente Meta + webhook + acciones), todo con TDD; luego la UI (layout full-height, lista, hilo, composer, notas). Unidades aisladas y testeables. ffmpeg cubre audio→ogg/opus y imagen→webp (sin añadir `sharp`).

**Tech Stack:** Next 16 App Router (Node runtime), Drizzle + better-sqlite3, Vitest (`makeTestDb`), WhatsApp Cloud API v22.0, ffmpeg (binario del sistema), lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-14-inbox-whatsapp-parity-design.md`

**Convenciones:** `bun run test` (vitest), `bunx tsc --noEmit`, `bun run lint` (biome). Migraciones con `bun run db:generate`. Commits en español. Borrar archivos `"* 2.*"` que reinyecta iCloud. NO rsync de `.env*`. Deploy `deploy/deploy.sh` (rama → necesita merge a main antes; ver Task 20).

**Paralelización:** Track A (Tasks 1-6, libs/schema) y partes de Track B/C son disjuntos. La UI (Tasks 13-18) depende de stores+acciones. Ejecutar en orden es seguro; subagentes pueden paralelizar 2/3/4/5/6.

---

## File Structure

**Crear:**
- `src/lib/media/transcode.ts` — wrappers ffmpeg (`toOggOpus`, `toWebpSticker`).
- `src/lib/inbox/reactions.ts` — store de `message_reactions`.
- `src/lib/inbox/stickers.ts` — store de `stickers`.
- `src/lib/inbox/notes.ts` — store de `conversation_notes`.
- `src/app/(app)/inbox/[id]/_components/audio-player.tsx` — reproductor minimal.
- `src/app/(app)/inbox/[id]/_components/voice-recorder.tsx` — grabadora (MediaRecorder).
- `src/app/(app)/inbox/[id]/_components/sticker-picker.tsx` — popover de stickers.
- `src/app/(app)/inbox/[id]/_components/notes-panel.tsx` — panel de notas internas.
- `src/app/(app)/inbox/[id]/_components/reaction-chip.tsx` — chip de reacción.
- Tests: `tests/unit/transcode.test.ts`, `tests/unit/reactions.test.ts`, `tests/unit/stickers.test.ts`, `tests/unit/notes.test.ts`, `tests/unit/auto-contact.test.ts`, `tests/unit/meta-sticker.test.ts`, `tests/integration/inbox-voice-sticker.test.ts`.
- Fixtures: `tests/fixtures/voice-sample.webm`, `tests/fixtures/sticker-sample.png`.

**Modificar:**
- `src/lib/db/schema/domain.ts` — 3 tablas nuevas.
- `src/lib/media/store.ts` — `saveMediaAsset` acepta `kind` explícito.
- `src/lib/meta/client.ts` — `sendMedia` admite kind `sticker`.
- `src/lib/meta/webhook.ts` — schema añade `contacts`.
- `src/lib/meta/webhook-handlers.ts` — profile name + reacción → store.
- `src/lib/inbox/store.ts` — auto-contacto, `getThread` devuelve reactions, helper outbound media.
- `src/app/api/inbox/media/[mediaId]/route.ts` — sirve asset local por id.
- `src/app/(app)/inbox/actions.ts` — refactor reacción, voz, sticker, notas.
- `src/app/(app)/layout.tsx` — permitir página full-height.
- `src/app/(app)/inbox/page.tsx` + `inbox/[id]/page.tsx` — quitar header, layout full-height, wiring.
- `src/app/(app)/inbox/[id]/_components/{thread,composer,thread-and-composer}.tsx` — rediseño.

---

## Track A — Schema y librerías

### Task 1: Tablas nuevas + migración

**Files:** Modify `src/lib/db/schema/domain.ts` · genera migración

- [ ] **Step 1:** Añadir al final de `domain.ts` (después de `quickReplies`):

```typescript
export const messageReactions = sqliteTable(
  "message_reactions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    targetWamid: text("target_wamid").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    emoji: text("emoji").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    uniqueTarget: uniqueIndex("message_reactions_target").on(t.orgId, t.targetWamid, t.direction),
    convIdx: index("message_reactions_conv").on(t.conversationId),
  }),
);

export const stickers = sqliteTable(
  "stickers",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    assetId: text("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("stickers_org").on(t.orgId) }),
);

export const conversationNotes = sqliteTable(
  "conversation_notes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ convIdx: index("conversation_notes_conv").on(t.conversationId, t.createdAt) }),
);
```

(El archivo ya importa `user` desde `./auth` — verificar; si no, añadir `import { user } from "./auth";`.)

- [ ] **Step 2:** Generar migración: `bun run db:generate`. Expected: nueva carpeta/SQL en `drizzle/migrations` con las 3 tablas.
- [ ] **Step 3:** Verificar que `makeTestDb()` aplica la migración: `bun run test tests/unit/quick-replies.test.ts` (sigue verde).
- [ ] **Step 4:** Commit `feat(db): tablas message_reactions, stickers, conversation_notes`.

---

### Task 2: `saveMediaAsset` acepta kind explícito

**Files:** Modify `src/lib/media/store.ts` · Test `tests/unit/media-store-kind.test.ts`

- [ ] **Step 1: Test** `tests/unit/media-store-kind.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";

describe("saveMediaAsset kind", () => {
  it("usa el kind explícito cuando se pasa", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const dir = mkdtempSync(join(tmpdir(), "media-"));
    const asset = await saveMediaAsset(db, { orgId: "o1", bytes: new ArrayBuffer(8), mime: "audio/ogg", kind: "audio", dir });
    expect(asset.kind).toBe("audio");
  });
});
```

- [ ] **Step 2:** Run → fail. `bun run test tests/unit/media-store-kind.test.ts`.
- [ ] **Step 3:** En `store.ts` cambiar el tipo `SavedAsset.kind` a `string` y la firma:

```typescript
export type SavedAsset = { id: string; kind: string; mime: string; path: string; bytes: number };

export async function saveMediaAsset(
  db: DB,
  input: { orgId: string; bytes: ArrayBuffer; mime: string; kind?: string; dir?: string },
): Promise<SavedAsset> {
  const dir = input.dir ?? env.MEDIA_DIR;
  mkdirSync(dir, { recursive: true });
  const id = `media_${crypto.randomUUID()}`;
  const path = join(dir, id);
  writeFileSync(path, Buffer.from(input.bytes));
  const kind = input.kind ?? (input.mime.startsWith("video/") ? "video" : input.mime.startsWith("audio/") ? "audio" : "image");
  const bytes = input.bytes.byteLength;
  await db.insert(mediaAssets).values({ id, orgId: input.orgId, kind, mime: input.mime, path, bytes, createdAt: new Date() });
  return { id, kind, mime: input.mime, path, bytes };
}
```

- [ ] **Step 4:** Run → pass. `bunx tsc --noEmit` (ver que no rompe callers).
- [ ] **Step 5:** Commit `feat(media): saveMediaAsset acepta kind explícito`.

---

### Task 3: Librería de transcodificación ffmpeg

**Files:** Create `src/lib/media/transcode.ts` · Test `tests/unit/transcode.test.ts` · fixtures

ffmpeg se invoca por `child_process.spawn` leyendo de stdin y escribiendo a stdout (sin tocar disco).

- [ ] **Step 1:** Crear fixtures reales (una sola vez, con ffmpeg local):

```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=1" -c:a libopus -f webm tests/fixtures/voice-sample.webm -y
printf '\x89PNG\r\n\x1a\n' > /dev/null # placeholder no; generar PNG real:
ffmpeg -f lavfi -i "color=c=red:s=64x64:d=1" -frames:v 1 tests/fixtures/sticker-sample.png -y
```

- [ ] **Step 2: Test** `tests/unit/transcode.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { toOggOpus, toWebpSticker } from "@/lib/media/transcode";

describe("transcode", () => {
  it("convierte webm/opus a ogg/opus", async () => {
    const input = readFileSync("tests/fixtures/voice-sample.webm");
    const out = await toOggOpus(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
    // OGG empieza con los bytes mágicos "OggS"
    expect(Buffer.from(out.subarray(0, 4)).toString("latin1")).toBe("OggS");
    expect(out.byteLength).toBeGreaterThan(0);
  }, 20000);

  it("convierte png a webp 512x512", async () => {
    const input = readFileSync("tests/fixtures/sticker-sample.png");
    const out = await toWebpSticker(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
    // WEBP: bytes 0-3 "RIFF", 8-11 "WEBP"
    expect(Buffer.from(out.subarray(0, 4)).toString("latin1")).toBe("RIFF");
    expect(Buffer.from(out.subarray(8, 12)).toString("latin1")).toBe("WEBP");
  }, 20000);
});
```

- [ ] **Step 3:** Run → fail.
- [ ] **Step 4:** Implementar `src/lib/media/transcode.ts`:

```typescript
import { spawn } from "node:child_process";

function run(args: string[], input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(new Uint8Array(Buffer.concat(chunks)));
      else reject(new Error(`ffmpeg salió ${code}: ${Buffer.concat(errChunks).toString().slice(-500)}`));
    });
    proc.stdin.on("error", () => {});
    proc.stdin.write(Buffer.from(input));
    proc.stdin.end();
  });
}

/** Convierte cualquier audio de entrada a OGG/Opus (nota de voz de WhatsApp). */
export async function toOggOpus(input: ArrayBuffer): Promise<Uint8Array> {
  return run(["-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1"], new Uint8Array(input));
}

/** Convierte una imagen a WEBP 512x512 (sticker de WhatsApp). */
export async function toWebpSticker(input: ArrayBuffer): Promise<Uint8Array> {
  return run([
    "-i", "pipe:0",
    "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
    "-vframes", "1", "-c:v", "libwebp", "-lossless", "0", "-q:v", "80", "-f", "webp", "pipe:1",
  ], new Uint8Array(input));
}
```

- [ ] **Step 5:** Run → pass. Commit `feat(media): transcode ffmpeg toOggOpus + toWebpSticker`.

---

### Task 4: Store de reacciones

**Files:** Create `src/lib/inbox/reactions.ts` · Test `tests/unit/reactions.test.ts`

- [ ] **Step 1: Test** `tests/unit/reactions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import { getReactionsForMessages, upsertReaction } from "@/lib/inbox/reactions";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
}

describe("reactions", () => {
  it("upsert crea y luego reemplaza la reacción del mismo lado", async () => {
    const { db } = makeTestDb(); await seed(db);
    await upsertReaction(db, { orgId: "o1", conversationId: "c1", targetWamid: "wamid.A", direction: "in", emoji: "👍" });
    await upsertReaction(db, { orgId: "o1", conversationId: "c1", targetWamid: "wamid.A", direction: "in", emoji: "❤️" });
    const map = await getReactionsForMessages(db, "o1", ["wamid.A"]);
    expect(map.get("wamid.A")).toEqual([{ direction: "in", emoji: "❤️" }]);
  });

  it("emoji vacío elimina la reacción", async () => {
    const { db } = makeTestDb(); await seed(db);
    await upsertReaction(db, { orgId: "o1", conversationId: "c1", targetWamid: "wamid.A", direction: "in", emoji: "👍" });
    await upsertReaction(db, { orgId: "o1", conversationId: "c1", targetWamid: "wamid.A", direction: "in", emoji: "" });
    const map = await getReactionsForMessages(db, "o1", ["wamid.A"]);
    expect(map.get("wamid.A")).toBeUndefined();
  });

  it("entrante y saliente coexisten en el mismo mensaje", async () => {
    const { db } = makeTestDb(); await seed(db);
    await upsertReaction(db, { orgId: "o1", conversationId: "c1", targetWamid: "wamid.A", direction: "in", emoji: "👍" });
    await upsertReaction(db, { orgId: "o1", conversationId: "c1", targetWamid: "wamid.A", direction: "out", emoji: "🙏" });
    const map = await getReactionsForMessages(db, "o1", ["wamid.A"]);
    expect(map.get("wamid.A")?.length).toBe(2);
  });
});
```

- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implementar `src/lib/inbox/reactions.ts`:

```typescript
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { messageReactions } from "@/lib/db/schema";

export async function upsertReaction(
  db: DB,
  p: { orgId: string; conversationId: string; targetWamid: string; direction: "in" | "out"; emoji: string },
): Promise<void> {
  if (!p.emoji.trim()) {
    await db.delete(messageReactions).where(and(
      eq(messageReactions.orgId, p.orgId),
      eq(messageReactions.targetWamid, p.targetWamid),
      eq(messageReactions.direction, p.direction),
    ));
    return;
  }
  await db.insert(messageReactions).values({
    id: randomUUID(), orgId: p.orgId, conversationId: p.conversationId,
    targetWamid: p.targetWamid, direction: p.direction, emoji: p.emoji, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [messageReactions.orgId, messageReactions.targetWamid, messageReactions.direction],
    set: { emoji: p.emoji, updatedAt: new Date() },
  });
}

export type ReactionView = { direction: "in" | "out"; emoji: string };

export async function getReactionsForMessages(
  db: DB, orgId: string, wamids: string[],
): Promise<Map<string, ReactionView[]>> {
  const map = new Map<string, ReactionView[]>();
  const ids = wamids.filter(Boolean);
  if (!ids.length) return map;
  const rows = await db.select().from(messageReactions).where(and(
    eq(messageReactions.orgId, orgId), inArray(messageReactions.targetWamid, ids),
  ));
  for (const r of rows) {
    const arr = map.get(r.targetWamid) ?? [];
    arr.push({ direction: r.direction, emoji: r.emoji });
    map.set(r.targetWamid, arr);
  }
  return map;
}
```

- [ ] **Step 4:** Run → pass. `bunx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(inbox): store de reacciones vinculadas`.

---

### Task 5: Store de stickers

**Files:** Create `src/lib/inbox/stickers.ts` · Test `tests/unit/stickers.test.ts`

- [ ] **Step 1: Test** `tests/unit/stickers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { addSticker, deleteSticker, listStickers } from "@/lib/inbox/stickers";

async function seed(db: any, id = "o1") {
  await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
}

describe("stickers", () => {
  it("añade y lista por org", async () => {
    const { db } = makeTestDb(); await seed(db);
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    const s = await addSticker(db, "o1", { webp: new Uint8Array([82, 73, 70, 70]), dir });
    const rows = await listStickers(db, "o1");
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(s.id);
    expect(rows[0].assetId).toBeTruthy();
  });

  it("aislamiento y borrado por org", async () => {
    const { db } = makeTestDb(); await seed(db, "o1"); await seed(db, "o2");
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    const s = await addSticker(db, "o1", { webp: new Uint8Array([82, 73, 70, 70]), dir });
    expect((await listStickers(db, "o2")).length).toBe(0);
    await deleteSticker(db, "o2", s.id); // org equivocada → no borra
    expect((await listStickers(db, "o1")).length).toBe(1);
    await deleteSticker(db, "o1", s.id);
    expect((await listStickers(db, "o1")).length).toBe(0);
  });
});
```

- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implementar `src/lib/inbox/stickers.ts`:

```typescript
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { stickers } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";

export async function listStickers(db: DB, orgId: string) {
  return db.select().from(stickers).where(eq(stickers.orgId, orgId)).orderBy(desc(stickers.createdAt));
}

export async function addSticker(db: DB, orgId: string, input: { webp: Uint8Array; dir?: string }) {
  const bytes = input.webp.buffer.slice(input.webp.byteOffset, input.webp.byteOffset + input.webp.byteLength);
  const asset = await saveMediaAsset(db, { orgId, bytes, mime: "image/webp", kind: "sticker", dir: input.dir });
  const row = { id: randomUUID(), orgId, assetId: asset.id, createdAt: new Date() };
  await db.insert(stickers).values(row);
  return row;
}

export async function deleteSticker(db: DB, orgId: string, id: string) {
  await db.delete(stickers).where(and(eq(stickers.id, id), eq(stickers.orgId, orgId)));
}
```

- [ ] **Step 4:** Run → pass. Commit `feat(inbox): store de stickers (colección por org)`.

---

### Task 6: Store de notas internas

**Files:** Create `src/lib/inbox/notes.ts` · Test `tests/unit/notes.test.ts`

- [ ] **Step 1: Test** `tests/unit/notes.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization, user } from "@/lib/db/schema";
import { addNote, deleteNote, listNotes } from "@/lib/inbox/notes";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(user).values({ id: "u1", name: "Luis", email: "l@x.co", emailVerified: false, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
}

describe("notes", () => {
  it("añade y lista por conversación", async () => {
    const { db } = makeTestDb(); await seed(db);
    await addNote(db, "o1", { conversationId: "c1", authorUserId: "u1", authorName: "Luis", body: "Cliente VIP" });
    const rows = await listNotes(db, "o1", "c1");
    expect(rows.length).toBe(1);
    expect(rows[0].body).toBe("Cliente VIP");
    expect(rows[0].authorName).toBe("Luis");
  });

  it("rechaza body vacío y respeta org al borrar", async () => {
    const { db } = makeTestDb(); await seed(db);
    await expect(addNote(db, "o1", { conversationId: "c1", authorUserId: "u1", authorName: "Luis", body: "  " })).rejects.toThrow();
    const n = await addNote(db, "o1", { conversationId: "c1", authorUserId: "u1", authorName: "Luis", body: "x" });
    await deleteNote(db, "o2", n.id);
    expect((await listNotes(db, "o1", "c1")).length).toBe(1);
  });
});
```

- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implementar `src/lib/inbox/notes.ts`:

```typescript
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { conversationNotes } from "@/lib/db/schema";

export async function listNotes(db: DB, orgId: string, conversationId: string) {
  return db.select().from(conversationNotes)
    .where(and(eq(conversationNotes.orgId, orgId), eq(conversationNotes.conversationId, conversationId)))
    .orderBy(asc(conversationNotes.createdAt));
}

export async function addNote(
  db: DB, orgId: string,
  input: { conversationId: string; authorUserId: string; authorName: string; body: string },
) {
  if (!input.body.trim()) throw new Error("La nota no puede estar vacía");
  const row = {
    id: randomUUID(), orgId, conversationId: input.conversationId,
    authorUserId: input.authorUserId, authorName: input.authorName,
    body: input.body.trim(), createdAt: new Date(),
  };
  await db.insert(conversationNotes).values(row);
  return row;
}

export async function deleteNote(db: DB, orgId: string, id: string) {
  await db.delete(conversationNotes).where(and(eq(conversationNotes.id, id), eq(conversationNotes.orgId, orgId)));
}
```

- [ ] **Step 4:** Run → pass. Commit `feat(inbox): store de notas internas`.

---

## Track B — Cliente Meta, webhook y contactos

### Task 7: `sendMedia` admite kind `sticker`

**Files:** Modify `src/lib/meta/client.ts` · Test `tests/unit/meta-sticker.test.ts`

- [ ] **Step 1: Test** `tests/unit/meta-sticker.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMedia } from "@/lib/meta/client";

const settings = { metaPhoneId: "PHONE1", metaAccessToken: "TOK" } as any;
afterEach(() => vi.restoreAllMocks());

describe("sendMedia sticker", () => {
  it("arma type sticker con media_id y sin caption", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.S" }] }), { status: 200 }));
    const r = await sendMedia(settings, { to: "+57300", kind: "sticker", mediaId: "M", caption: "ignored" });
    expect(r).toEqual({ wamid: "wamid.S" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body.type).toBe("sticker");
    expect(body.sticker).toEqual({ id: "M" });
  });
});
```

- [ ] **Step 2:** Run → fail (el tipo `kind` no incluye `sticker`).
- [ ] **Step 3:** En `client.ts`, cambiar la firma de `sendMedia` para incluir `"sticker"` en `kind` y construir el body. La línea de `media`/`caption` debe excluir caption/filename para sticker:

```typescript
export async function sendMedia(
  settings: DecryptedSettings,
  p: { to: string; kind: "image" | "audio" | "video" | "document" | "sticker"; mediaId: string; caption?: string; filename?: string; replyTo?: string },
): Promise<{ wamid: string } | { error: MetaError }> {
  if (!settings.metaPhoneId || !settings.metaAccessToken)
    return { error: { code: 0, message: "Meta creds not configured", type: "auth" } };
  const media: Record<string, unknown> = { id: p.mediaId };
  if (p.caption && (p.kind === "image" || p.kind === "video" || p.kind === "document")) media.caption = p.caption;
  if (p.filename && p.kind === "document") media.filename = p.filename;
  const body: Record<string, unknown> = { messaging_product: "whatsapp", to: p.to.replace(/^\+/, ""), type: p.kind, [p.kind]: media };
  if (p.replyTo) body.context = { message_id: p.replyTo };
  const res = await fetch(`https://graph.facebook.com/v22.0/${settings.metaPhoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${settings.metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: number; message: string } };
    return { error: classify(j.error?.code, j.error?.message) };
  }
  const j = (await res.json()) as { messages: { id: string }[] };
  return { wamid: j.messages[0].id };
}
```

- [ ] **Step 4:** Run → pass + `bunx tsc --noEmit` (revisar callers de `sendMedia`).
- [ ] **Step 5:** Commit `feat(meta): sendMedia admite stickers`.

---

### Task 8: Webhook schema admite `contacts` (profile name)

**Files:** Modify `src/lib/meta/webhook.ts`

- [ ] **Step 1:** Añadir `contacts` al `value` del schema (después de `metadata`):

```typescript
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }).optional(),
                }),
              )
              .optional(),
```

- [ ] **Step 2:** `bunx tsc --noEmit`. Commit `feat(meta): webhook parsea contacts (profile name)`.

---

### Task 9: Auto-guardado de contactos

**Files:** Modify `src/lib/inbox/store.ts` · Test `tests/unit/auto-contact.test.ts`

- [ ] **Step 1: Test** `tests/unit/auto-contact.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, organization } from "@/lib/db/schema";
import { getOrCreateConversation } from "@/lib/inbox/store";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("auto contacto", () => {
  it("crea contacto en el primer entrante con profile name", async () => {
    const { db } = makeTestDb(); await seed(db);
    const conv = await getOrCreateConversation(db, "o1", "+57300", new Date(), "Camila");
    const c = (await db.select().from(contacts).where(eq(contacts.id, conv.contactId!)))[0];
    expect(c.name).toBe("Camila");
    expect(c.phone).toBe("+57300");
  });

  it("no pisa un nombre puesto a mano", async () => {
    const { db } = makeTestDb(); await seed(db);
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "+57300", name: "Mi Nombre", customFields: "{}", createdAt: new Date(), updatedAt: new Date() });
    const conv = await getOrCreateConversation(db, "o1", "+57300", new Date(), "Camila");
    const c = (await db.select().from(contacts).where(eq(contacts.id, conv.contactId!)))[0];
    expect(c.name).toBe("Mi Nombre");
  });

  it("rellena nombre si el contacto existía sin nombre", async () => {
    const { db } = makeTestDb(); await seed(db);
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "+57300", name: null, customFields: "{}", createdAt: new Date(), updatedAt: new Date() });
    const conv = await getOrCreateConversation(db, "o1", "+57300", new Date(), "Camila");
    const c = (await db.select().from(contacts).where(eq(contacts.id, conv.contactId!)))[0];
    expect(c.name).toBe("Camila");
  });
});
```

- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Modificar `getOrCreateConversation` en `store.ts` para aceptar `profileName?` y auto-crear/rellenar el contacto. Reemplazar la función:

```typescript
export async function getOrCreateConversation(db: DB, orgId: string, phone: string, ts: Date, profileName?: string | null) {
  let contact = (await db.select().from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone))))[0];

  if (!contact) {
    const newContact = {
      id: randomUUID(), orgId, phone, name: profileName?.trim() || null, email: null,
      customFields: "{}", optOutAt: null, createdAt: ts, updatedAt: ts,
    };
    await db.insert(contacts).values(newContact).onConflictDoNothing();
    contact = (await db.select().from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone))))[0];
  } else if (!contact.name && profileName?.trim()) {
    await db.update(contacts).set({ name: profileName.trim(), updatedAt: ts }).where(eq(contacts.id, contact.id));
    contact = { ...contact, name: profileName.trim() };
  }

  const existing = (await db.select().from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.phone, phone))))[0];
  if (existing) {
    if (!existing.contactId && contact) {
      await db.update(conversations).set({ contactId: contact.id }).where(eq(conversations.id, existing.id));
      return { ...existing, contactId: contact.id };
    }
    return existing;
  }

  const row = {
    id: randomUUID(), orgId, phone, contactId: contact?.id ?? null,
    lastMessageAt: ts, lastIncomingAt: null as Date | null, unreadCount: 0, createdAt: ts,
  };
  await db.insert(conversations).values(row).onConflictDoNothing();
  return (await db.select().from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.phone, phone))))[0];
}
```

- [ ] **Step 4:** Propagar `profileName` en `recordInboundMessage` (añadir campo opcional `profileName` al input y pasarlo a `getOrCreateConversation`):

```typescript
export async function recordInboundMessage(db: DB, input: {
  orgId: string; phone: string; wamid: string; parsed: ParsedInbound; ts: Date; profileName?: string | null;
}): Promise<void> {
  const conv = await getOrCreateConversation(db, input.orgId, input.phone, input.ts, input.profileName);
  // …resto igual…
```

- [ ] **Step 5:** Run → pass. `bunx tsc --noEmit` (verás que `handleInboundMessage` aún no pasa profileName — se arregla en Task 10).
- [ ] **Step 6:** Commit `feat(inbox): auto-guardado de contactos con profile name`.

---

### Task 10: Webhook — pasar profile name y vincular reacción entrante

**Files:** Modify `src/lib/meta/webhook-handlers.ts` · `src/app/api/webhook/meta/route.ts` · Test `tests/unit/webhook-reaction.test.ts`

- [ ] **Step 1: Test** `tests/unit/webhook-reaction.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, messageReactions, messages, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { handleInboundMessage } from "@/lib/meta/webhook-handlers";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
}

describe("webhook reacción entrante", () => {
  it("vincula la reacción y NO crea mensaje", async () => {
    const { db } = makeTestDb(); await seed(db);
    await handleInboundMessage(db, "o1", {
      from: "57300", id: "wamid.R", timestamp: "1700000000", type: "reaction",
      reaction: { message_id: "wamid.TARGET", emoji: "👍" },
    } as any, []);
    const rx = await db.select().from(messageReactions).where(eq(messageReactions.targetWamid, "wamid.TARGET"));
    expect(rx.length).toBe(1);
    expect(rx[0].emoji).toBe("👍");
    const msgs = await db.select().from(messages).where(eq(messages.orgId, "o1"));
    expect(msgs.filter((m: any) => m.type === "reaction").length).toBe(0);
  });
});
```

- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** En `webhook-handlers.ts`: importar `upsertReaction` y `getOrCreateConversation`; añadir parámetro `profileName?` a `handleInboundMessage`; manejar reacción antes de `recordInboundMessage`:

```typescript
import { upsertReaction } from "@/lib/inbox/reactions";
import { getOrCreateConversation, recordInboundMessage, updateMessageStatusByWamid } from "@/lib/inbox/store";
// …firma:
export async function handleInboundMessage(
  db: DB,
  orgId: string,
  msg: { from: string; id: string; timestamp: string; type: string; text?: { body: string }; reaction?: { message_id: string; emoji: string } } & Record<string, unknown>,
  optoutKeywords: string[],
  profileName?: string | null,
) {
  const phone = "+" + msg.from.replace(/^\+/, "");
  const ts = new Date(Number(msg.timestamp) * 1000);

  // Reacción entrante → vincular al mensaje objetivo, NO crear mensaje
  if (msg.type === "reaction" && msg.reaction) {
    const conv = await getOrCreateConversation(db, orgId, phone, ts, profileName);
    await upsertReaction(db, {
      orgId, conversationId: conv.id, targetWamid: msg.reaction.message_id,
      direction: "in", emoji: msg.reaction.emoji ?? "",
    });
    return;
  }
  // …resto del cuerpo existente (optout, replied, messageEvents)…
  // al final cambiar la llamada:
  await recordInboundMessage(db, { orgId, phone, wamid: msg.id, parsed: parseInboundMessage(msg), ts, profileName });
}
```

(Mantener el resto del cuerpo existente intacto entre el bloque de reacción y la llamada final.)

- [ ] **Step 4:** En `route.ts`, pasar el profile name desde `v.contacts`:

```typescript
      if (v.messages) {
        const profileName = v.contacts?.[0]?.profile?.name ?? null;
        for (const m of v.messages) await handleInboundMessage(db, settings.orgId, m, settings.optoutKeywords, profileName);
      }
```

- [ ] **Step 5:** Run → pass. `bunx tsc --noEmit`.
- [ ] **Step 6:** Commit `feat(webhook): reacción entrante vinculada + profile name a contactos`.

---

## Track C — Media route y acciones

### Task 11: Media route sirve assets locales por id

**Files:** Modify `src/app/api/inbox/media/[mediaId]/route.ts`

El media saliente se guardará con id `media_…` (prefijo de `saveMediaAsset`). El route detecta ese prefijo y sirve el asset local directamente (con check de org); si no, hace el flujo de Meta actual.

- [ ] **Step 1:** Al inicio del `GET`, tras `requireOrg`, añadir:

```typescript
  // Asset local (media saliente persistido): id con prefijo "media_"
  if (mediaId.startsWith("media_")) {
    const asset = await getMediaAsset(db, mediaId);
    if (!asset || asset.orgId !== orgId) return new Response("Not found", { status: 404 });
    const buf = await readFile(asset.path);
    return new Response(buf, {
      headers: { "content-type": asset.mime, "cache-control": "private, max-age=86400" },
    });
  }
```

(Importar `getMediaAsset` ya está; `asset.orgId` existe en la fila de `mediaAssets`.)

- [ ] **Step 2:** `bunx tsc --noEmit`. Commit `feat(inbox): media route sirve assets locales`.

---

### Task 12: Helper de persistencia de media saliente + refactor acciones

**Files:** Modify `src/lib/inbox/store.ts` (`recordOutboundMessage` acepta `mediaId`), `src/app/(app)/inbox/actions.ts`, `src/lib/inbox/store.ts` (`getThread` devuelve reactions) · Test `tests/integration/inbox-voice-sticker.test.ts`

- [ ] **Step 1:** En `store.ts`, `recordOutboundMessage` acepta `mediaId?: string | null` y lo persiste (hoy fuerza `mediaId: null`):

```typescript
export async function recordOutboundMessage(db: DB, input: {
  orgId: string; conversationId: string; wamid: string | null; type: string;
  body: string | null; status?: "pending" | "sent" | "failed"; errorMessage?: string | null; mediaId?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(messages).values({
    id, conversationId: input.conversationId, orgId: input.orgId, direction: "out",
    wamid: input.wamid, type: input.type, body: input.body, mediaId: input.mediaId ?? null,
    status: input.status ?? (input.wamid ? "sent" : "failed"),
    errorMessage: input.errorMessage ?? null, payloadJson: null, createdAt: now,
  });
  await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, input.conversationId));
  return id;
}
```

- [ ] **Step 2:** En `store.ts`, `getThread` añade reacciones por wamid (para render). Al final, antes del `return`:

```typescript
  const wamids = msgs.map((m) => m.wamid).filter((w): w is string => !!w);
  const reactions = await getReactionsForMessages(db, orgId, wamids);
  const reactionsByWamid: Record<string, { direction: "in" | "out"; emoji: string }[]> = {};
  for (const [k, v] of reactions) reactionsByWamid[k] = v;
  return { conversation: conv, messages: msgs, contact: contact ?? null, reactions: reactionsByWamid };
```

(Importar `getReactionsForMessages` desde `./reactions`. Filtrar en el render los `messages` con `type === "reaction"`, ver Task 15.)

- [ ] **Step 3:** Refactor `sendReactionAction` en `actions.ts` — upsert en store, NO crea mensaje:

```typescript
export async function sendReactionAction(
  conversationId: string,
  input: { wamid: string; emoji: string },
): Promise<SendResult> {
  const { orgId } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };

  const settings = await getOrgSettings(db, orgId);
  const sendRes = await sendReaction(settings, { to: thread.conversation.phone, wamid: input.wamid, emoji: input.emoji });
  if ("error" in sendRes) return { ok: false, error: `No se pudo enviar la reacción: ${sendRes.error.message}` };

  await upsertReaction(db, { orgId, conversationId, targetWamid: input.wamid, direction: "out", emoji: input.emoji });
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}
```

(Importar `upsertReaction`. `sendReaction` con `emoji: ""` quita la reacción en Meta — soportar quitar reacción pasando emoji vacío.)

- [ ] **Step 4:** En `sendMediaAction`, persistir copia local y referenciarla. Tras decodificar a `arrayBuffer` y antes/después del envío exitoso, guardar asset y pasar `mediaId`:

```typescript
  // tras envío OK:
  const asset = await saveMediaAsset(db, { orgId, bytes: arrayBuffer, mime: input.mime, kind: input.kind });
  await recordOutboundMessage(db, {
    orgId, conversationId, wamid: sendRes.wamid, type: input.kind,
    body: input.caption ?? null, status: "sent", mediaId: asset.id,
  });
```

(Importar `saveMediaAsset`. En los `recordOutboundMessage` de error dejar `mediaId` sin pasar. Cambiar `body: input.caption ?? "[media]"` por `input.caption ?? null` para que el render muestre el media, no el texto placeholder.)

- [ ] **Step 5: Test de integración** `tests/integration/inbox-voice-sticker.test.ts` (cubre Task 12-14; usa mock de fetch para Meta y de transcode). Escribir el archivo con casos: `sendMediaAction` persiste asset local y registra mensaje con `mediaId`; gate sin suscripción bloquea; ventana cerrada bloquea. Patrón:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
// mockear getThread/settings/gate vía spies sobre los módulos, o usar makeTestDb + seed real.
// Verificar: tras sendMediaAction OK, existe 1 message out con type "image" y mediaId que empieza por "media_".
```

(El implementador elige mock de fetch global + seed real de org/conv/subscription activa + settings con creds; sigue el patrón de `tests/unit/meta-client-inbox.test.ts` para el mock de `fetch`.)

- [ ] **Step 6:** Run → pass. `bunx tsc --noEmit`. Commit `feat(inbox): media saliente visible + reacciones vinculadas en acciones`.

---

### Task 13: Acción de nota de voz

**Files:** Modify `src/app/(app)/inbox/actions.ts`

- [ ] **Step 1:** Añadir `sendVoiceAction` (transcodifica → sube → envía → persiste local):

```typescript
import { toOggOpus } from "@/lib/media/transcode";

export async function sendVoiceAction(
  conversationId: string,
  input: { dataBase64: string; mime: string },
): Promise<SendResult> {
  const { orgId } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };
  if (!isWindowOpen(thread.conversation.lastIncomingAt)) {
    return { ok: false, error: "La ventana de 24h está cerrada. Usa una plantilla.", windowClosed: true };
  }

  const raw = Buffer.from(input.dataBase64, "base64");
  let ogg: Uint8Array;
  try {
    ogg = await toOggOpus(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  } catch (e) {
    return { ok: false, error: `No se pudo procesar el audio: ${e instanceof Error ? e.message : "error"}` };
  }
  const oggBuf = Buffer.from(ogg);
  const settings = await getOrgSettings(db, orgId);
  const up = await uploadMedia(settings, { bytes: oggBuf.buffer.slice(oggBuf.byteOffset, oggBuf.byteOffset + oggBuf.byteLength), mime: "audio/ogg", filename: "voz.ogg" });
  if ("error" in up) return { ok: false, error: `No se pudo subir la voz: ${up.error.message}` };

  const sendRes = await sendMedia(settings, { to: thread.conversation.phone, kind: "audio", mediaId: up.mediaId });
  if ("error" in sendRes) {
    await recordOutboundMessage(db, { orgId, conversationId, wamid: null, type: "audio", body: null, status: "failed", errorMessage: sendRes.error.message });
    return { ok: false, error: `No se pudo enviar: ${sendRes.error.message}` };
  }

  const asset = await saveMediaAsset(db, { orgId, bytes: oggBuf.buffer.slice(oggBuf.byteOffset, oggBuf.byteOffset + oggBuf.byteLength), mime: "audio/ogg", kind: "audio" });
  await recordOutboundMessage(db, { orgId, conversationId, wamid: sendRes.wamid, type: "audio", body: null, status: "sent", mediaId: asset.id });
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}
```

- [ ] **Step 2:** `bunx tsc --noEmit`. Cubierto por el test de integración de Task 12 (añadir caso de `sendVoiceAction` con `toOggOpus` mockeado a un buffer "OggS…").
- [ ] **Step 3:** Commit `feat(inbox): enviar notas de voz (ffmpeg→ogg/opus)`.

---

### Task 14: Acciones de stickers (subir colección + enviar)

**Files:** Modify `src/app/(app)/inbox/actions.ts`

- [ ] **Step 1:** Añadir acciones:

```typescript
import { toWebpSticker } from "@/lib/media/transcode";
import { addSticker, listStickers } from "@/lib/inbox/stickers";
import { getMediaAsset } from "@/lib/media/store";
import { readFile } from "node:fs/promises";

export async function addStickerAction(input: { dataBase64: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId } = await requireOrg();
  const raw = Buffer.from(input.dataBase64, "base64");
  let webp: Uint8Array;
  try {
    webp = await toWebpSticker(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  } catch (e) {
    return { ok: false, error: `No se pudo crear el sticker: ${e instanceof Error ? e.message : "error"}` };
  }
  await addSticker(db, orgId, { webp });
  revalidatePath(`/inbox`);
  return { ok: true };
}

export async function sendStickerAction(conversationId: string, input: { stickerId: string }): Promise<SendResult> {
  const { orgId } = await requireOrg();
  const gate = await checkSubscriptionGate(db, orgId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };
  if (!isWindowOpen(thread.conversation.lastIncomingAt)) {
    return { ok: false, error: "La ventana de 24h está cerrada. Usa una plantilla.", windowClosed: true };
  }
  const list = await listStickers(db, orgId);
  const sticker = list.find((s) => s.id === input.stickerId);
  if (!sticker) return { ok: false, error: "Sticker no encontrado" };
  const asset = await getMediaAsset(db, sticker.assetId);
  if (!asset) return { ok: false, error: "Sticker no disponible" };
  const bytes = await readFile(asset.path);

  const settings = await getOrgSettings(db, orgId);
  const up = await uploadMedia(settings, { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: "image/webp", filename: "sticker.webp" });
  if ("error" in up) return { ok: false, error: `No se pudo subir el sticker: ${up.error.message}` };
  const sendRes = await sendMedia(settings, { to: thread.conversation.phone, kind: "sticker", mediaId: up.mediaId });
  if ("error" in sendRes) return { ok: false, error: `No se pudo enviar: ${sendRes.error.message}` };

  await recordOutboundMessage(db, { orgId, conversationId, wamid: sendRes.wamid, type: "sticker", body: null, status: "sent", mediaId: asset.id });
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}
```

- [ ] **Step 2:** `bunx tsc --noEmit`. Commit `feat(inbox): subir y enviar stickers`.

---

### Task 15: Acciones de notas internas

**Files:** Modify `src/app/(app)/inbox/actions.ts`

- [ ] **Step 1:** Añadir:

```typescript
import { addNote, deleteNote } from "@/lib/inbox/notes";

export async function addNoteAction(conversationId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId, session } = await requireOrg();
  if (!body.trim()) return { ok: false, error: "La nota no puede estar vacía" };
  const thread = await getThread(db, orgId, conversationId);
  if (!thread) return { ok: false, error: "Conversación no encontrada" };
  const authorName = session.user.name ?? session.user.email;
  await addNote(db, orgId, { conversationId, authorUserId: session.user.id, authorName, body });
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true };
}

export async function deleteNoteAction(conversationId: string, noteId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await deleteNote(db, orgId, noteId);
  revalidatePath(`/inbox/${conversationId}`);
}
```

(Verificar la forma real de `requireOrg()` — si no devuelve `session`, obtener el usuario con `requireSession()`. Ajustar acorde a `src/lib/auth/session.ts`.)

- [ ] **Step 2:** `bunx tsc --noEmit`. Commit `feat(inbox): notas internas (acciones)`.

---

## Track D — UI (rediseño minimal, iconos lucide)

> Estética: minimal moderno estilo WhatsApp. Usa tokens existentes (`bg-card`, `text-muted-foreground`, `border`, `bg-emerald-*`). Iconos lucide con `aria-label`. Respeta `prefers-reduced-motion`. Toda burbuja/control accesible por teclado.

### Task 16: Layout full-height + quitar header redundante

**Files:** Modify `src/app/(app)/layout.tsx`, `src/app/(app)/inbox/page.tsx`, `src/app/(app)/inbox/[id]/page.tsx`

- [ ] **Step 1:** En `layout.tsx`, el `<main>` debe permitir hijos full-height sin romper otras páginas. Cambiar el wrapper para que la altura fluya: el `main` mantiene scroll, pero el contenedor padded usa `min-h-full flex flex-col`. Concretamente, cambiar:

```tsx
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8 md:px-10 md:py-10 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            {children}
          </div>
        </div>
      </main>
```

(Las páginas normales siguen creciendo y scrolleando dentro del div intermedio; el inbox usará `flex-1 min-h-0` para llenar.)

- [ ] **Step 2:** En `inbox/page.tsx` y `inbox/[id]/page.tsx`: eliminar el bloque `<header>…<h1>Inbox</h1>…</header>`. Cambiar el contenedor raíz de `<div className="space-y-6">` a `<div className="flex flex-1 min-h-0 flex-col">` y el grid a altura completa: `<div className="grid flex-1 min-h-0 gap-4 md:grid-cols-[320px_1fr]">`. La lista (`<div className="flex flex-col gap-3">`) añade `min-h-0`; su lista interna ya tiene `flex-1 overflow-y-auto`. El panel derecho (`<div className="flex flex-col border rounded-lg bg-card overflow-hidden">`) añade `min-h-0`.
- [ ] **Step 3:** Verificar manualmente con `bun run dev`: cargar una conversación con muchos mensajes → la página NO crece; el hilo scrollea internamente; el composer queda fijo abajo. (Ver Task 20 para arranque local.)
- [ ] **Step 4:** `bunx tsc --noEmit` + `bun run lint`. Commit `fix(inbox): layout full-height con scroll interno + quitar header redundante`.

---

### Task 17: Reproductor de audio + chip de reacción + auto-scroll (componentes base)

**Files:** Create `audio-player.tsx`, `reaction-chip.tsx` · Modify `thread-and-composer.tsx`

- [ ] **Step 1:** `_components/audio-player.tsx` ("use client") — reproductor minimal:

```tsx
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
    if (playing) { a.pause(); } else { void a.play(); }
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <button type="button" onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </button>
      <div className="h-1 flex-1 rounded-full bg-muted-foreground/20">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${dur ? (progress / dur) * 100 : 0}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(dur ? dur - progress : 0)}</span>
      <audio ref={ref} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}
```

- [ ] **Step 2:** `_components/reaction-chip.tsx` ("use client"):

```tsx
export function ReactionChips({ reactions }: { reactions: { direction: "in" | "out"; emoji: string }[] }) {
  if (!reactions.length) return null;
  return (
    <div className="absolute -bottom-2 right-1 flex gap-0.5 rounded-full border bg-background px-1 py-0.5 shadow-sm">
      {reactions.map((r, i) => (<span key={i} className="text-xs leading-none">{r.emoji}</span>))}
    </div>
  );
}
```

- [ ] **Step 3:** En `thread-and-composer.tsx`, añadir auto-scroll al fondo cuando cambian los mensajes. Envolver el `Thread` con un ref + efecto:

```tsx
import { useEffect, useRef, useState } from "react";
// …
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages.length]);
// en el JSX, dentro del div scrolleable:
      <div className="flex-1 overflow-y-auto p-4">
        <Thread messages={messages} reactions={reactions} onReplyTo={setReplyTo} />
        <div ref={bottomRef} />
      </div>
```

(Pasar `reactions` como prop nueva desde la page → ThreadAndComposer → Thread. Tipar `reactions: Record<string, {direction:"in"|"out";emoji:string}[]>`.)

- [ ] **Step 4:** `bunx tsc --noEmit`. Commit `feat(inbox): reproductor de audio, chips de reacción y auto-scroll`.

---

### Task 18: Rediseño del hilo (burbujas, fechas, agrupación, media)

**Files:** Modify `src/app/(app)/inbox/[id]/_components/thread.tsx`

- [ ] **Step 1:** Aceptar prop `reactions` y filtrar mensajes `type:"reaction"` (legacy) del render:

```tsx
type ThreadProps = {
  messages: Message[];
  reactions: Record<string, { direction: "in" | "out"; emoji: string }[]>;
  onReplyTo: (wamid: string) => void;
};
// dentro: const visible = messages.filter((m) => m.type !== "reaction");
```

- [ ] **Step 2:** Añadir separadores de fecha (Hoy/Ayer/fecha) entre grupos y agrupar burbujas consecutivas del mismo `direction`. Insertar un helper `dayLabel(date)` y, al mapear `visible`, comparar el día con el mensaje previo para renderizar un `<DateSeparator>` (pill centrada `text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5`).
- [ ] **Step 3:** En `MessageBubble`, envolver la burbuja en `relative` y montar `<ReactionChips reactions={reactions[message.wamid ?? ""] ?? []} />`. Reemplazar el caso `audio` de `renderMessageContent` por `<AudioPlayer src={\`/api/inbox/media/${message.mediaId}\`} />`. Para `sticker`, render transparente sin fondo de burbuja (img ~128px, `className="size-32 object-contain"`). Para media saliente, `message.mediaId` ahora existe → las imágenes/videos/audio salientes se renderizan igual que entrantes.
- [ ] **Step 4:** Stickers y notas de voz NO deben llevar el fondo/padding de burbuja: cuando `type === "sticker"`, render sin el `div` de burbuja con `bg-*` (solo la imagen + hora debajo). Ajustar el contenedor para ese caso.
- [ ] **Step 5:** `bunx tsc --noEmit` + `bun run lint`. Verificación visual en dev. Commit `feat(inbox): hilo rediseñado (fechas, agrupación, media saliente, stickers, voz)`.

---

### Task 19: Composer rediseñado (mic, sticker picker, attach, mic↔enviar)

**Files:** Create `voice-recorder.tsx`, `sticker-picker.tsx` · Modify `composer.tsx`, `inbox/[id]/page.tsx` (cargar stickers)

- [ ] **Step 1:** `_components/voice-recorder.tsx` ("use client") — graba con MediaRecorder y devuelve base64 al padre:

```tsx
"use client";
import { useRef, useState } from "react";
import { MicIcon, SendIcon, Trash2Icon, SquareIcon } from "lucide-react";

export function VoiceRecorder({ onSend, disabled }: { onSend: (dataBase64: string, mime: string) => Promise<void>; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((b: Blob | null) => void) | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolveRef.current?.(chunksRef.current.length ? new Blob(chunksRef.current, { type: rec.mimeType }) : null);
      };
      recRef.current = rec; rec.start();
      setRecording(true); setSecs(0);
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch { /* permiso denegado */ }
  };

  const finish = (send: boolean): Promise<void> => new Promise((resolve) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    resolveRef.current = async (blob) => {
      if (send && blob) {
        const buf = await blob.arrayBuffer();
        const b64 = Buffer.from(new Uint8Array(buf)).toString("base64");
        await onSend(b64, blob.type);
      }
      resolve();
    };
    recRef.current?.stop();
  });

  if (!recording) {
    return (
      <button type="button" onClick={start} disabled={disabled} aria-label="Grabar nota de voz"
        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
        <MicIcon className="size-5" />
      </button>
    );
  }
  const fmt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => finish(false)} aria-label="Cancelar" className="rounded-full p-2 text-red-600 hover:bg-red-50">
        <Trash2Icon className="size-5" />
      </button>
      <span className="flex items-center gap-1.5 text-sm text-red-600"><span className="size-2 animate-pulse rounded-full bg-red-600" />{fmt}</span>
      <div className="flex-1" />
      <button type="button" onClick={() => finish(true)} aria-label="Enviar nota de voz" className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white">
        <SendIcon className="size-4" />
      </button>
    </div>
  );
}
```

(Nota: usar `Buffer` en cliente — Next polyfilla `Buffer` en el bundle; si lint se queja, usar `btoa` sobre un binary string. El implementador valida que `Buffer` exista en runtime del navegador; alternativa: `let bin=""; new Uint8Array(buf).forEach(b=>bin+=String.fromCharCode(b)); const b64=btoa(bin);`.)

- [ ] **Step 2:** `_components/sticker-picker.tsx` ("use client") — popover con grid + botón añadir:

```tsx
"use client";
import { useRef, useState } from "react";
import { StickerIcon, PlusIcon } from "lucide-react";
import { addStickerAction, sendStickerAction } from "../../actions";

type Sticker = { id: string; assetId: string };

export function StickerPicker({ conversationId, stickers, disabled }: { conversationId: string; stickers: Sticker[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    let bin = ""; new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
    setBusy(true); await addStickerAction({ dataBase64: btoa(bin) }); setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const onSend = async (id: string) => { setBusy(true); await sendStickerAction(conversationId, { stickerId: id }); setBusy(false); setOpen(false); };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-label="Stickers"
        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
        <StickerIcon className="size-5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border bg-background p-2 shadow-lg">
          <div className="grid grid-cols-4 gap-2">
            {stickers.map((s) => (
              <button key={s.id} type="button" onClick={() => onSend(s.id)} disabled={busy} className="rounded hover:bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/inbox/media/${s.assetId}`} alt="sticker" className="size-12 object-contain" />
              </button>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Añadir sticker"
              className="flex size-12 items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted">
              <PlusIcon className="size-5" />
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onAdd} className="hidden" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** En `inbox/[id]/page.tsx`, cargar stickers (`listStickers`) y pasarlos por `ThreadAndComposer` → `Composer`. En `composer.tsx`: integrar `VoiceRecorder` (llamando a `sendVoiceAction`) y `StickerPicker`; mostrar mic cuando el textarea está vacío y el botón Enviar cuando hay texto (estado controlado del textarea). Mantener attach (paperclip), plantilla y respuestas rápidas. Iconos lucide con `aria-label` en todos los botones. Composer envuelto en una barra redondeada (`rounded-2xl border bg-background`).
- [ ] **Step 4:** `bunx tsc --noEmit` + `bun run lint`. Verificación en dev (grabar voz, enviar sticker, subir sticker). Commit `feat(inbox): composer con voz, stickers y mic↔enviar`.

---

### Task 20: Panel de notas internas

**Files:** Create `notes-panel.tsx` · Modify `inbox/[id]/page.tsx` (cargar notas + botón en header)

- [ ] **Step 1:** En `inbox/[id]/page.tsx`, cargar `listNotes(db, orgId, conversationId)` y renderizar un botón `NotebookPen` (lucide) en el header de la conversación que togglea `<NotesPanel>` (client). Pasar notas + conversationId.
- [ ] **Step 2:** `_components/notes-panel.tsx` ("use client") — lista (autor + hora + body, estilo ámbar) + textarea + botón añadir (`addNoteAction`) + borrar (`deleteNoteAction`). Drawer/panel deslizante a la derecha del hilo o sobre él (`absolute inset-y-0 right-0 w-80 border-l bg-card`). Cerrar con `X`. Texto claro: "Notas internas — solo tu equipo las ve".
- [ ] **Step 3:** `bunx tsc --noEmit` + `bun run lint`. Commit `feat(inbox): panel de notas internas`.

---

## Track E — Review, gauntlet y deploy

### Task 21: Review + gauntlet + deploy

- [ ] **Step 1:** Borrar archivos basura de iCloud si aparecen: `find src tests -name "* 2.*" -delete`.
- [ ] **Step 2:** Gauntlet completo: `bun run test` (todo verde) + `bunx tsc --noEmit` (cero) + `bun run lint` (cero).
- [ ] **Step 3:** Review con subagente `code-reviewer` (correctness, aislamiento por org en stores/acciones nuevas, gate de ventana 24h en voz/sticker, a11y de los componentes nuevos, Core Web Vitals del inbox). Aplicar findings.
- [ ] **Step 4:** Verificar **ffmpeg en prod**: `ssh root@158.220.123.213 "which ffmpeg || (apt-get update && apt-get install -y ffmpeg)"`. (Requiere aprobación del host de prod.)
- [ ] **Step 5:** Merge a `main` y deploy: `git checkout main && git merge --no-ff feat/inbox-whatsapp-parity` → `git push` → `bash deploy/deploy.sh`.
- [ ] **Step 6:** Smoke prod en `luladev.com/inbox`: abrir la conversación de ejemplo (Meta ya conectado) → el scroll funciona (no crece la página); enviar texto, imagen (se ve en el hilo), nota de voz (se reproduce), sticker (subir + enviar); reaccionar a un mensaje entrante (chip en la burbuja, no burbuja suelta); añadir una nota interna; verificar que con ventana cerrada solo deja plantillas. Actualizar memoria.

---

## Self-review (cobertura del spec)

- **Reacciones vinculadas** → Tasks 1 (tabla), 4 (store), 10 (webhook entrante), 12 (acción saliente + getThread), 17/18 (chip en burbuja, filtrar legacy). ✓
- **Notas de voz** → Tasks 2 (kind audio), 3 (ffmpeg ogg), 13 (acción), 17 (player), 19 (grabadora). ✓
- **Stickers (colección + enviar/recibir)** → Tasks 1 (tabla), 3 (webp), 5 (store), 7 (Meta sticker), 14 (acciones), 19 (picker), 18 (render entrante). ✓
- **Media saliente visible** → Tasks 2, 11 (route local), 12 (persistir + mediaId), 18 (render). ✓
- **Auto-contactos** → Tasks 8 (schema contacts), 9 (store), 10 (webhook pasa profile name). ✓
- **Notas internas** → Tasks 1 (tabla), 6 (store), 15 (acciones), 20 (panel). ✓
- **Scroll / layout / quitar header** → Tasks 16, 17 (auto-scroll). ✓
- **Rediseño minimal + iconos lucide** → Tasks 16-20. ✓
- **Ventana 24h** → gate en Tasks 13/14 (voz/sticker), notas exentas (15). ✓

**Consistencia de tipos:** `saveMediaAsset({kind})` (T2) usado en T3-derivados/T5/T12/T13/T14; `recordOutboundMessage({mediaId})` (T12) usado en T12/T13/T14; `upsertReaction` (T4) en T10/T12; `getReactionsForMessages` (T4) en T12 `getThread`; `getOrCreateConversation(…, profileName)` (T9) en T10; `sendMedia` kind `sticker` (T7) en T14. Reproductor/recorder/picker (T17/T19) consumen las acciones de T12-14.

**Pendiente de verificar en ejecución (no bloqueante):** forma exacta de `requireOrg()` (¿devuelve `session`?) para T15; existencia de `Buffer` en bundle cliente para T19 (fallback `btoa` documentado).
