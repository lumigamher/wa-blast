# Agente IA — RAG / Base Documental Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada org sube documentos (menú, políticas, FAQ, fichas) → se trocean, se generan embeddings y se guardan; en cada turno el agente recupera los fragmentos relevantes a la consulta del cliente y responde con la info real de la empresa.

**Architecture:** Módulo in-process `src/lib/agent/rag/`. Embeddings vía abstracción `EmbeddingProvider` (default OpenAI `text-embedding-3-small`, 1536 dims). Vector store = chunks + embedding (JSON) en sqlite; similitud coseno en JS sobre los chunks de la org (retriever abstracto → migrable a sqlite-vec luego). Inyección por **auto-RAG** en `context.ts` (bloque "Información de la empresa") + tool opcional `buscar_en_docs`. Panel bajo `/configuracion/agente` (módulo Premium ya gateado).

**Tech Stack:** Next.js 15 (App Router, server actions), Drizzle + better-sqlite3 (sqlite), OpenAI SDK (ya dependencia), `unpdf` (extracción de texto de PDF, sin binarios nativos), Vitest, Zod.

**Decisiones pivote confirmadas (2026-06-21):**
1. Embeddings default = **OpenAI `text-embedding-3-small`** (abstracción modular).
2. Vector store v1 = **coseno en JS sobre sqlite** (retriever abstracto).
3. Inyección = **auto-RAG en `context.ts`** + tool opcional `buscar_en_docs`.
4. Formatos v1 = **texto pegado + .txt/.md + PDF** (texto embebido, no escaneados).
5. Límites por org = **20 docs / 2 MB c/u / 1500 chunks** (constantes, subibles por plan luego).

---

## File Structure

**Crear:**
- `src/lib/agent/rag/limits.ts` — constantes de límites (`RAG_LIMITS`).
- `src/lib/agent/rag/chunk.ts` — `chunkText` (puro).
- `src/lib/agent/rag/chunk.test.ts`
- `src/lib/agent/rag/vector.ts` — `cosineSimilarity`, `serializeEmbedding`, `deserializeEmbedding`.
- `src/lib/agent/rag/vector.test.ts`
- `src/lib/agent/rag/embeddings/types.ts` — `EmbeddingProvider`.
- `src/lib/agent/rag/embeddings/openai.ts` — impl OpenAI.
- `src/lib/agent/rag/embeddings/openai.test.ts`
- `src/lib/agent/rag/embeddings/index.ts` — `getEmbeddingProvider()` (env).
- `src/lib/agent/rag/extract.ts` — `extractText(file)` (txt/md/pdf).
- `src/lib/agent/rag/extract.test.ts`
- `src/lib/agent/rag/retrieve.ts` — `retrieve` (coseno, top-k, scoping orgId).
- `src/lib/agent/rag/retrieve.test.ts`
- `src/lib/agent/rag/ingest.ts` — `ingestDocument` (chunk→embed→insert, límites).
- `src/lib/agent/rag/ingest.test.ts`
- `src/lib/agent/rag/admin.ts` — `listDocuments`, `deleteDocument`, `countDocuments`, `countChunks`, `orgHasDocuments`.
- `src/lib/agent/rag/admin.test.ts`
- `src/lib/agent/rag/index.ts` — `retrieveKnowledge`, `buildKnowledgeBlock`.
- `src/lib/agent/rag/index.test.ts`
- `src/lib/agent/rag/testing/fake-embeddings.ts` — `EmbeddingProvider` falso determinístico (tests).
- `src/lib/agent/tools/builtin/buscar-en-docs.ts` — tool opcional.
- `src/lib/agent/tools/builtin/buscar-en-docs.test.ts`
- `src/app/api/agent/documents/route.ts` — POST subida (multipart) → extract → ingest.
- `src/app/(app)/configuracion/agente/_documents.tsx` — sección panel.

**Modificar:**
- `src/lib/db/schema/domain.ts` — tablas `agentDocuments`, `documentChunks`.
- `drizzle/migrations/` — nueva migración generada (0022).
- `src/lib/agent/context.ts` — `buildSystemPrompt` acepta `knowledge?`.
- `src/lib/agent/context.test.ts` — caso con knowledge.
- `src/lib/agent/turn.ts` — auto-RAG antes del loop.
- `src/lib/agent/turn.test.ts` — caso inyección.
- `src/lib/agent/cost.ts` — tarifa embeddings + `estimateEmbeddingCostCop`.
- `src/lib/agent/cost.test.ts`
- `src/lib/agent/tools/registry.ts` — registrar `buscar_en_docs`.
- `src/app/(app)/configuracion/agente/page.tsx` — render sección Documentos.
- `src/app/(app)/configuracion/agente/actions.ts` — acciones pegar-texto / borrar.
- `package.json` — dependencia `unpdf`.

---

## Task 1: Dependencia unpdf + constantes de límites

**Files:**
- Modify: `package.json` (vía `bun add`)
- Create: `src/lib/agent/rag/limits.ts`

- [ ] **Step 1: Instalar unpdf**

Run: `cd /Users/luismiguel/Documents/wa-blast && bun add unpdf`
Expected: añade `unpdf` a dependencies en `package.json`, sin errores.

- [ ] **Step 2: Crear constantes de límites**

Create `src/lib/agent/rag/limits.ts`:

```ts
// Límites de la base documental por org. v1 = constantes planas.
// (Subibles por plan luego: mover a un mapa PlanId → límites.)
export const RAG_LIMITS = {
  maxDocsPerOrg: 20,
  maxBytesPerDoc: 2 * 1024 * 1024, // 2 MB
  maxChunksPerOrg: 1500,
} as const;
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock src/lib/agent/rag/limits.ts
git commit -m "chore(rag): add unpdf dep + document limits"
```

---

## Task 2: Schema de tablas RAG + migración

**Files:**
- Modify: `src/lib/db/schema/domain.ts` (añadir al final)
- Create: `drizzle/migrations/0022_*.sql` (generada)

- [ ] **Step 1: Añadir las tablas al schema**

Al final de `src/lib/db/schema/domain.ts` (después de `orderPayments`), añade:

```ts
export const agentDocuments = sqliteTable(
  "agent_documents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source", { enum: ["upload", "text"] }).notNull(),
    mediaAssetId: text("media_asset_id"),
    status: text("status", { enum: ["indexando", "listo", "error"] })
      .notNull()
      .default("indexando"),
    errorMessage: text("error_message"),
    chunkCount: integer("chunk_count").notNull().default(0),
    bytes: integer("bytes").notNull().default(0),
    embedModel: text("embed_model"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("agent_documents_org_idx").on(t.orgId, t.createdAt) }),
);

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => agentDocuments.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    text: text("text").notNull(),
    // Embedding serializado como JSON array (number[]). v1 simple; blob = optimización futura.
    embedding: text("embedding").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("document_chunks_org_idx").on(t.orgId) }),
);
```

- [ ] **Step 2: Generar la migración**

Run: `bun run db:generate`
Expected: crea `drizzle/migrations/0022_<nombre>.sql` con `CREATE TABLE agent_documents` y `CREATE TABLE document_chunks`. Verifica el SQL generado contiene ambas tablas y los índices.

- [ ] **Step 3: Verificar que el test-db migra sin error**

Run: `bunx vitest run src/lib/agent/context.test.ts`
Expected: PASS (las tablas nuevas se crean al migrar `:memory:`; ningún test existente se rompe).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations
git commit -m "feat(rag): schema agent_documents + document_chunks"
```

---

## Task 3: chunkText (puro)

**Files:**
- Create: `src/lib/agent/rag/chunk.ts`
- Test: `src/lib/agent/rag/chunk.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/rag/chunk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("texto vacío → sin chunks", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("texto corto → un solo chunk normalizado", () => {
    const out = chunkText("Hola   mundo\n\n");
    expect(out).toEqual(["Hola mundo"]);
  });

  it("texto largo → varios chunks que respetan maxChars", () => {
    const text = "a ".repeat(3000); // ~6000 chars
    const out = chunkText(text, { maxChars: 2000, overlapChars: 200 });
    expect(out.length).toBeGreaterThan(2);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(2000);
  });

  it("aplica solape entre chunks consecutivos", () => {
    const text = Array.from({ length: 500 }, (_, i) => `palabra${i}`).join(" ");
    const out = chunkText(text, { maxChars: 1000, overlapChars: 200 });
    expect(out.length).toBeGreaterThan(1);
    // El final del chunk 0 reaparece al inicio del chunk 1 (solape).
    const tail0 = out[0].slice(-50);
    expect(out[1]).toContain(tail0.trim().split(" ").pop() as string);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/chunk.test.ts`
Expected: FAIL ("Cannot find module './chunk'").

- [ ] **Step 3: Implementar chunkText**

Create `src/lib/agent/rag/chunk.ts`:

```ts
export type ChunkOptions = { maxChars?: number; overlapChars?: number };

/**
 * Trocea texto en fragmentos solapados. Determinístico (char-based).
 * Normaliza espacios, intenta cortar en límite de palabra/oración.
 */
export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 2000;
  const overlapChars = opts.overlapChars ?? 200;
  const text = input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf(" "),
      );
      if (lastBreak > maxChars * 0.5) end = start + lastBreak + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/chunk.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/rag/chunk.ts src/lib/agent/rag/chunk.test.ts
git commit -m "feat(rag): pure chunkText with overlap"
```

---

## Task 4: vector.ts (coseno + serialización)

**Files:**
- Create: `src/lib/agent/rag/vector.ts`
- Test: `src/lib/agent/rag/vector.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/rag/vector.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cosineSimilarity, deserializeEmbedding, serializeEmbedding } from "./vector";

describe("vector", () => {
  it("coseno de vectores idénticos = 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("coseno de ortogonales = 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("vector cero → 0 (sin NaN)", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("ordena por similitud (más cercano primero)", () => {
    const q = [1, 0];
    const a = cosineSimilarity(q, [0.9, 0.1]);
    const b = cosineSimilarity(q, [0.1, 0.9]);
    expect(a).toBeGreaterThan(b);
  });

  it("serialize/deserialize es ida y vuelta", () => {
    const v = [0.1, -0.2, 0.3];
    expect(deserializeEmbedding(serializeEmbedding(v))).toEqual(v);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/vector.test.ts`
Expected: FAIL ("Cannot find module './vector'").

- [ ] **Step 3: Implementar vector.ts**

Create `src/lib/agent/rag/vector.ts`:

```ts
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function serializeEmbedding(v: number[]): string {
  return JSON.stringify(v);
}

export function deserializeEmbedding(s: string): number[] {
  return JSON.parse(s) as number[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/vector.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/rag/vector.ts src/lib/agent/rag/vector.test.ts
git commit -m "feat(rag): cosine similarity + embedding serialization"
```

---

## Task 5: EmbeddingProvider (tipos + OpenAI + fake)

**Files:**
- Create: `src/lib/agent/rag/embeddings/types.ts`
- Create: `src/lib/agent/rag/embeddings/openai.ts`
- Create: `src/lib/agent/rag/embeddings/index.ts`
- Create: `src/lib/agent/rag/testing/fake-embeddings.ts`
- Test: `src/lib/agent/rag/embeddings/openai.test.ts`

- [ ] **Step 1: Crear los tipos**

Create `src/lib/agent/rag/embeddings/types.ts`:

```ts
export interface EmbeddingProvider {
  /** Identificador del modelo (para guardar en agent_documents.embed_model). */
  readonly model: string;
  /** Dimensión de los vectores. */
  readonly dims: number;
  /** Devuelve un embedding por cada texto, en el mismo orden. */
  embed(texts: string[]): Promise<number[][]>;
}
```

- [ ] **Step 2: Crear el fake determinístico (para tests de otros módulos)**

Create `src/lib/agent/rag/testing/fake-embeddings.ts`:

```ts
import type { EmbeddingProvider } from "../embeddings/types";

/**
 * EmbeddingProvider falso y determinístico para tests.
 * Mapea cada texto a un vector pequeño basado en presencia de palabras clave,
 * de modo que textos similares produzcan vectores cercanos.
 */
export function makeFakeEmbeddings(
  vocab: string[] = ["menu", "precio", "horario", "envio", "pago"],
): EmbeddingProvider {
  return {
    model: "fake-embeddings",
    dims: vocab.length,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((t) => {
        const low = t.toLowerCase();
        return vocab.map((w) => (low.includes(w) ? 1 : 0));
      });
    },
  };
}
```

- [ ] **Step 3: Escribir el test que falla (OpenAI impl con fetch del SDK mockeado)**

Create `src/lib/agent/rag/embeddings/openai.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { makeOpenAiEmbeddingProvider } from "./openai";

describe("makeOpenAiEmbeddingProvider", () => {
  it("mapea la respuesta del SDK a number[][] en orden", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [
        { index: 0, embedding: [0.1, 0.2] },
        { index: 1, embedding: [0.3, 0.4] },
      ],
    });
    const client = { embeddings: { create } } as never;
    const provider = makeOpenAiEmbeddingProvider(client);

    const out = await provider.embed(["hola", "mundo"]);

    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(create).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["hola", "mundo"],
    });
    expect(provider.model).toBe("text-embedding-3-small");
    expect(provider.dims).toBe(1536);
  });

  it("respeta el orden aunque el SDK devuelva index desordenado", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [
        { index: 1, embedding: [9, 9] },
        { index: 0, embedding: [1, 1] },
      ],
    });
    const client = { embeddings: { create } } as never;
    const provider = makeOpenAiEmbeddingProvider(client);
    const out = await provider.embed(["a", "b"]);
    expect(out).toEqual([
      [1, 1],
      [9, 9],
    ]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/embeddings/openai.test.ts`
Expected: FAIL ("Cannot find module './openai'").

- [ ] **Step 5: Implementar la impl OpenAI**

Create `src/lib/agent/rag/embeddings/openai.ts`:

```ts
import type OpenAI from "openai";
import type { EmbeddingProvider } from "./types";

const MODEL = "text-embedding-3-small";
const DIMS = 1536;

export function makeOpenAiEmbeddingProvider(client: OpenAI): EmbeddingProvider {
  return {
    model: MODEL,
    dims: DIMS,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const res = await client.embeddings.create({ model: MODEL, input: texts });
      return [...res.data]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding as number[]);
    },
  };
}
```

- [ ] **Step 6: Crear el factory desde env**

Create `src/lib/agent/rag/embeddings/index.ts`:

```ts
import OpenAI from "openai";
import { makeOpenAiEmbeddingProvider } from "./openai";
import type { EmbeddingProvider } from "./types";

export type { EmbeddingProvider } from "./types";

/** Construye el provider de embeddings por defecto (OpenAI) desde env. */
export function getEmbeddingProvider(): EmbeddingProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada");
  return makeOpenAiEmbeddingProvider(new OpenAI({ apiKey: key }));
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/embeddings/openai.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/rag/embeddings src/lib/agent/rag/testing
git commit -m "feat(rag): EmbeddingProvider (OpenAI) + fake for tests"
```

---

## Task 6: extractText (txt/md/pdf)

**Files:**
- Create: `src/lib/agent/rag/extract.ts`
- Test: `src/lib/agent/rag/extract.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/rag/extract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractDocumentText } from "./extract";

function fileFrom(name: string, type: string, content: string): File {
  return new File([content], name, { type });
}

describe("extractDocumentText", () => {
  it("txt → devuelve el texto tal cual", async () => {
    const f = fileFrom("notas.txt", "text/plain", "Hola mundo");
    const out = await extractDocumentText(f);
    expect(out).toBe("Hola mundo");
  });

  it("markdown → devuelve el texto tal cual", async () => {
    const f = fileFrom("doc.md", "text/markdown", "# Título\nContenido");
    const out = await extractDocumentText(f);
    expect(out).toContain("Título");
    expect(out).toContain("Contenido");
  });

  it("extensión desconocida pero texto → lo decodifica", async () => {
    const f = fileFrom("x.csv", "", "a,b,c");
    const out = await extractDocumentText(f);
    expect(out).toBe("a,b,c");
  });

  it("PDF vacío/ilegible → lanza error claro", async () => {
    const f = fileFrom("malo.pdf", "application/pdf", "no soy un pdf");
    await expect(extractDocumentText(f)).rejects.toThrow(/pdf/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/extract.test.ts`
Expected: FAIL ("Cannot find module './extract'").

- [ ] **Step 3: Implementar extractDocumentText**

Create `src/lib/agent/rag/extract.ts`:

```ts
import { extractText, getDocumentProxy } from "unpdf";

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/** Extrae texto plano de un archivo subido (txt/md/csv/… directo; PDF vía unpdf). */
export async function extractDocumentText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  if (isPdf(file)) {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      const clean = (text ?? "").trim();
      if (!clean) throw new Error("PDF sin texto extraíble (¿escaneado?)");
      return clean;
    } catch (e) {
      throw new Error(
        `No pude leer el PDF: ${e instanceof Error ? e.message : "ilegible"}`,
      );
    }
  }
  // Texto plano (txt, md, csv, etc.)
  return new TextDecoder().decode(buf).trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/extract.test.ts`
Expected: PASS (4 tests). El test del PDF inválido pasa porque `getDocumentProxy` rechaza datos no-PDF y lo envolvemos con mensaje "No pude leer el PDF".

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/rag/extract.ts src/lib/agent/rag/extract.test.ts
git commit -m "feat(rag): extractDocumentText (txt/md/pdf via unpdf)"
```

---

## Task 7: retrieve (coseno sobre chunks de la org)

**Files:**
- Create: `src/lib/agent/rag/retrieve.ts`
- Test: `src/lib/agent/rag/retrieve.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/rag/retrieve.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { agentDocuments, documentChunks } from "@/lib/db/schema";
import { serializeEmbedding } from "./vector";
import { retrieve } from "./retrieve";

async function seedOrg(db: ReturnType<typeof makeTestDb>["db"], orgId: string) {
  await db.insert(organization).values({
    id: orgId,
    name: orgId,
    slug: orgId,
    createdAt: new Date(),
  });
  const docId = randomUUID();
  await db.insert(agentDocuments).values({
    id: docId,
    orgId,
    name: "doc",
    source: "text",
    status: "listo",
    chunkCount: 0,
    bytes: 0,
    createdAt: new Date(),
  });
  return docId;
}

async function addChunk(
  db: ReturnType<typeof makeTestDb>["db"],
  orgId: string,
  documentId: string,
  idx: number,
  text: string,
  embedding: number[],
) {
  await db.insert(documentChunks).values({
    id: randomUUID(),
    orgId,
    documentId,
    idx,
    text,
    embedding: serializeEmbedding(embedding),
    createdAt: new Date(),
  });
}

describe("retrieve", () => {
  let db: ReturnType<typeof makeTestDb>["db"];

  beforeEach(() => {
    db = makeTestDb().db;
  });

  it("devuelve top-k ordenado por similitud", async () => {
    const docId = await seedOrg(db, "org1");
    await addChunk(db, "org1", docId, 0, "lejos", [0, 1]);
    await addChunk(db, "org1", docId, 1, "cerca", [1, 0]);
    await addChunk(db, "org1", docId, 2, "medio", [0.7, 0.7]);

    const out = await retrieve(db, "org1", [1, 0], 2);

    expect(out).toHaveLength(2);
    expect(out[0].text).toBe("cerca");
    expect(out[1].text).toBe("medio");
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("aísla por orgId (no filtra chunks de otra org)", async () => {
    const d1 = await seedOrg(db, "orgA");
    const d2 = await seedOrg(db, "orgB");
    await addChunk(db, "orgA", d1, 0, "soloA", [1, 0]);
    await addChunk(db, "orgB", d2, 0, "soloB", [1, 0]);

    const out = await retrieve(db, "orgA", [1, 0], 5);
    expect(out.map((c) => c.text)).toEqual(["soloA"]);
  });

  it("org sin chunks → []", async () => {
    await seedOrg(db, "vacia");
    expect(await retrieve(db, "vacia", [1, 0], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/retrieve.test.ts`
Expected: FAIL ("Cannot find module './retrieve'").

- [ ] **Step 3: Implementar retrieve**

Create `src/lib/agent/rag/retrieve.ts`:

```ts
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { documentChunks } from "@/lib/db/schema";
import { cosineSimilarity, deserializeEmbedding } from "./vector";

export type RetrievedChunk = {
  documentId: string;
  text: string;
  score: number;
};

/**
 * Recupera los top-k chunks de la org más similares al queryEmbedding.
 * Coseno en JS sobre los chunks de la org (scoping estricto por orgId).
 * Abstracción: cambiar a sqlite-vec/pgvector sin tocar los callers.
 */
export async function retrieve(
  db: DB,
  orgId: string,
  queryEmbedding: number[],
  k: number,
): Promise<RetrievedChunk[]> {
  const rows = await db
    .select({
      documentId: documentChunks.documentId,
      text: documentChunks.text,
      embedding: documentChunks.embedding,
    })
    .from(documentChunks)
    .where(eq(documentChunks.orgId, orgId));

  const scored = rows.map((r) => ({
    documentId: r.documentId,
    text: r.text,
    score: cosineSimilarity(queryEmbedding, deserializeEmbedding(r.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/retrieve.test.ts`
Expected: PASS (3 tests). Si `organization` requiere columnas extra, ajusta `seedOrg` a las columnas reales del schema auth (revisa `src/lib/db/schema/auth.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/rag/retrieve.ts src/lib/agent/rag/retrieve.test.ts
git commit -m "feat(rag): retrieve top-k by cosine, org-scoped"
```

---

## Task 8: admin (list/delete/count/hasDocuments)

**Files:**
- Create: `src/lib/agent/rag/admin.ts`
- Test: `src/lib/agent/rag/admin.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/rag/admin.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { agentDocuments, documentChunks } from "@/lib/db/schema";
import { serializeEmbedding } from "./vector";
import {
  countChunks,
  countDocuments,
  deleteDocument,
  listDocuments,
  orgHasDocuments,
} from "./admin";

function makeOrg(db: ReturnType<typeof makeTestDb>["db"], orgId: string) {
  return db.insert(organization).values({
    id: orgId,
    name: orgId,
    slug: orgId,
    createdAt: new Date(),
  });
}

async function makeDoc(
  db: ReturnType<typeof makeTestDb>["db"],
  orgId: string,
  name: string,
  chunks: number,
) {
  const docId = randomUUID();
  await db.insert(agentDocuments).values({
    id: docId,
    orgId,
    name,
    source: "text",
    status: "listo",
    chunkCount: chunks,
    bytes: 0,
    createdAt: new Date(),
  });
  for (let i = 0; i < chunks; i++) {
    await db.insert(documentChunks).values({
      id: randomUUID(),
      orgId,
      documentId: docId,
      idx: i,
      text: `chunk ${i}`,
      embedding: serializeEmbedding([1, 0]),
      createdAt: new Date(),
    });
  }
  return docId;
}

describe("rag/admin", () => {
  let db: ReturnType<typeof makeTestDb>["db"];

  beforeEach(async () => {
    db = makeTestDb().db;
    await makeOrg(db, "org1");
  });

  it("listDocuments devuelve los docs de la org (sin embeddings)", async () => {
    await makeDoc(db, "org1", "menu", 2);
    const out = await listDocuments(db, "org1");
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("menu");
    expect(out[0].chunkCount).toBe(2);
  });

  it("countDocuments / countChunks / orgHasDocuments", async () => {
    expect(await orgHasDocuments(db, "org1")).toBe(false);
    await makeDoc(db, "org1", "a", 3);
    await makeDoc(db, "org1", "b", 1);
    expect(await countDocuments(db, "org1")).toBe(2);
    expect(await countChunks(db, "org1")).toBe(4);
    expect(await orgHasDocuments(db, "org1")).toBe(true);
  });

  it("deleteDocument borra doc + sus chunks (cascade), scoping orgId", async () => {
    const docId = await makeDoc(db, "org1", "x", 2);
    await deleteDocument(db, "org1", docId);
    expect(await countDocuments(db, "org1")).toBe(0);
    expect(await countChunks(db, "org1")).toBe(0);
  });

  it("deleteDocument de otra org no borra nada", async () => {
    await makeOrg(db, "org2");
    const docId = await makeDoc(db, "org1", "x", 1);
    await deleteDocument(db, "org2", docId);
    expect(await countDocuments(db, "org1")).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/admin.test.ts`
Expected: FAIL ("Cannot find module './admin'").

- [ ] **Step 3: Implementar admin**

Create `src/lib/agent/rag/admin.ts`:

```ts
import { and, count, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentDocuments, documentChunks } from "@/lib/db/schema";

export async function listDocuments(db: DB, orgId: string) {
  return db
    .select({
      id: agentDocuments.id,
      name: agentDocuments.name,
      source: agentDocuments.source,
      status: agentDocuments.status,
      chunkCount: agentDocuments.chunkCount,
      bytes: agentDocuments.bytes,
      errorMessage: agentDocuments.errorMessage,
      createdAt: agentDocuments.createdAt,
    })
    .from(agentDocuments)
    .where(eq(agentDocuments.orgId, orgId))
    .orderBy(desc(agentDocuments.createdAt));
}

export async function countDocuments(db: DB, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(agentDocuments)
    .where(eq(agentDocuments.orgId, orgId));
  return row?.n ?? 0;
}

export async function countChunks(db: DB, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(documentChunks)
    .where(eq(documentChunks.orgId, orgId));
  return row?.n ?? 0;
}

export async function orgHasDocuments(db: DB, orgId: string): Promise<boolean> {
  return (await countChunks(db, orgId)) > 0;
}

export async function deleteDocument(
  db: DB,
  orgId: string,
  documentId: string,
): Promise<void> {
  // Borra el doc con scoping de org; los chunks caen por cascade (FK).
  await db
    .delete(agentDocuments)
    .where(
      and(eq(agentDocuments.id, documentId), eq(agentDocuments.orgId, orgId)),
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/admin.test.ts`
Expected: PASS (4 tests). Si el cascade de chunks no dispara (pragma off), añade un `db.delete(documentChunks)` explícito antes del doc dentro de `deleteDocument`. (`test-db.ts` activa `foreign_keys = ON`, así que el cascade funciona.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/rag/admin.ts src/lib/agent/rag/admin.test.ts
git commit -m "feat(rag): document admin (list/delete/count)"
```

---

## Task 9: ingestDocument (chunk → embed → insert, con límites)

**Files:**
- Create: `src/lib/agent/rag/ingest.ts`
- Test: `src/lib/agent/rag/ingest.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/rag/ingest.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { makeFakeEmbeddings } from "./testing/fake-embeddings";
import { countChunks, countDocuments, listDocuments } from "./admin";
import { ingestDocument } from "./ingest";

describe("ingestDocument", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  const embeddings = makeFakeEmbeddings();

  beforeEach(async () => {
    db = makeTestDb().db;
    await db.insert(organization).values({
      id: "org1",
      name: "org1",
      slug: "org1",
      createdAt: new Date(),
    });
  });

  it("trocea, embebe e inserta chunks; marca el doc listo", async () => {
    const text = "El menu tiene precio especial. ".repeat(200);
    const res = await ingestDocument(
      db,
      "org1",
      { name: "menu.txt", text, source: "text" },
      { embeddings },
    );
    expect(res.chunkCount).toBeGreaterThan(0);
    expect(await countChunks(db, "org1")).toBe(res.chunkCount);
    const docs = await listDocuments(db, "org1");
    expect(docs[0].status).toBe("listo");
    expect(docs[0].chunkCount).toBe(res.chunkCount);
    expect(docs[0].name).toBe("menu.txt");
  });

  it("rechaza si supera maxDocsPerOrg", async () => {
    const tiny = { name: "x", text: "hola", source: "text" as const };
    // Sembrar el tope (mockeamos límite bajo vía override)
    for (let i = 0; i < 2; i++) {
      await ingestDocument(db, "org1", tiny, { embeddings, limits: { maxDocsPerOrg: 2, maxBytesPerDoc: 999999, maxChunksPerOrg: 999999 } });
    }
    await expect(
      ingestDocument(db, "org1", tiny, { embeddings, limits: { maxDocsPerOrg: 2, maxBytesPerDoc: 999999, maxChunksPerOrg: 999999 } }),
    ).rejects.toThrow(/límite|limite|máximo|maximo/i);
    expect(await countDocuments(db, "org1")).toBe(2);
  });

  it("texto vacío → error sin crear doc", async () => {
    await expect(
      ingestDocument(db, "org1", { name: "v", text: "   ", source: "text" }, { embeddings }),
    ).rejects.toThrow(/vac/i);
    expect(await countDocuments(db, "org1")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/ingest.test.ts`
Expected: FAIL ("Cannot find module './ingest'").

- [ ] **Step 3: Implementar ingestDocument**

Create `src/lib/agent/rag/ingest.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentDocuments, documentChunks } from "@/lib/db/schema";
import { countChunks, countDocuments } from "./admin";
import { chunkText } from "./chunk";
import type { EmbeddingProvider } from "./embeddings/types";
import { RAG_LIMITS } from "./limits";
import { serializeEmbedding } from "./vector";

export type IngestInput = {
  name: string;
  text: string;
  source?: "upload" | "text";
  mediaAssetId?: string | null;
  bytes?: number;
};

export type IngestDeps = {
  embeddings: EmbeddingProvider;
  limits?: typeof RAG_LIMITS;
};

export async function ingestDocument(
  db: DB,
  orgId: string,
  input: IngestInput,
  deps: IngestDeps,
): Promise<{ documentId: string; chunkCount: number }> {
  const limits = deps.limits ?? RAG_LIMITS;
  const text = input.text.trim();
  if (!text) throw new Error("El documento está vacío.");

  const bytes = input.bytes ?? Buffer.byteLength(input.text, "utf8");
  if (bytes > limits.maxBytesPerDoc) {
    throw new Error(
      `El documento supera el máximo de ${Math.round(limits.maxBytesPerDoc / 1024 / 1024)} MB.`,
    );
  }
  if ((await countDocuments(db, orgId)) >= limits.maxDocsPerOrg) {
    throw new Error(
      `Alcanzaste el límite de ${limits.maxDocsPerOrg} documentos. Borra alguno para subir otro.`,
    );
  }

  const pieces = chunkText(text);
  if (pieces.length === 0) throw new Error("El documento está vacío.");

  const existingChunks = await countChunks(db, orgId);
  if (existingChunks + pieces.length > limits.maxChunksPerOrg) {
    throw new Error(
      `El documento excede el límite de ${limits.maxChunksPerOrg} fragmentos de la base. Borra documentos o reduce el tamaño.`,
    );
  }

  const documentId = randomUUID();
  const now = new Date();
  await db.insert(agentDocuments).values({
    id: documentId,
    orgId,
    name: input.name,
    source: input.source ?? "text",
    mediaAssetId: input.mediaAssetId ?? null,
    status: "indexando",
    chunkCount: 0,
    bytes,
    embedModel: deps.embeddings.model,
    createdAt: now,
  });

  try {
    const vectors = await deps.embeddings.embed(pieces);
    await db.insert(documentChunks).values(
      pieces.map((piece, i) => ({
        id: randomUUID(),
        orgId,
        documentId,
        idx: i,
        text: piece,
        embedding: serializeEmbedding(vectors[i]),
        createdAt: now,
      })),
    );
    await db
      .update(agentDocuments)
      .set({ status: "listo", chunkCount: pieces.length })
      .where(eq(agentDocuments.id, documentId));
    return { documentId, chunkCount: pieces.length };
  } catch (e) {
    await db
      .update(agentDocuments)
      .set({
        status: "error",
        errorMessage: e instanceof Error ? e.message : "error al indexar",
      })
      .where(eq(agentDocuments.id, documentId));
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/ingest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/rag/ingest.ts src/lib/agent/rag/ingest.test.ts
git commit -m "feat(rag): ingestDocument with limits + status tracking"
```

---

## Task 10: retrieveKnowledge + buildKnowledgeBlock (orquestación)

**Files:**
- Create: `src/lib/agent/rag/index.ts`
- Test: `src/lib/agent/rag/index.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/rag/index.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { makeFakeEmbeddings } from "./testing/fake-embeddings";
import { ingestDocument } from "./ingest";
import { buildKnowledgeBlock, retrieveKnowledge } from "./index";

describe("buildKnowledgeBlock", () => {
  it("une chunks con separador y respeta el tope de chars", () => {
    const block = buildKnowledgeBlock(
      [{ text: "uno" }, { text: "dos" }, { text: "tres" }],
      9,
    );
    expect(block).toContain("uno");
    // "uno\n---\ndos" = 11 chars > 9 → corta antes de "dos"
    expect(block).toBe("uno");
  });

  it("sin chunks → cadena vacía", () => {
    expect(buildKnowledgeBlock([], 100)).toBe("");
  });
});

describe("retrieveKnowledge", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  const embeddings = makeFakeEmbeddings();

  beforeEach(async () => {
    db = makeTestDb().db;
    await db.insert(organization).values({
      id: "org1",
      name: "org1",
      slug: "org1",
      createdAt: new Date(),
    });
  });

  it("org sin documentos → '' (no llama embeddings)", async () => {
    const out = await retrieveKnowledge(db, "org1", "precio del menu", { embeddings });
    expect(out).toBe("");
  });

  it("recupera el chunk relevante a la consulta", async () => {
    await ingestDocument(
      db,
      "org1",
      { name: "info", text: "El horario es de 9 a 6.\n\nEl envio cuesta 5000 pesos.", source: "text" },
      { embeddings },
    );
    const out = await retrieveKnowledge(db, "org1", "cuánto cuesta el envio", { embeddings }, { k: 1 });
    expect(out.toLowerCase()).toContain("envio");
  });

  it("query vacía → ''", async () => {
    expect(await retrieveKnowledge(db, "org1", "   ", { embeddings })).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/rag/index.test.ts`
Expected: FAIL ("does not provide an export named 'retrieveKnowledge'").

- [ ] **Step 3: Implementar index.ts**

Create `src/lib/agent/rag/index.ts`:

```ts
import type { DB } from "@/lib/db/client";
import { orgHasDocuments } from "./admin";
import type { EmbeddingProvider } from "./embeddings/types";
import { retrieve } from "./retrieve";

export { ingestDocument } from "./ingest";
export {
  listDocuments,
  deleteDocument,
  countDocuments,
  orgHasDocuments,
} from "./admin";

const DEFAULT_K = 5;
const DEFAULT_MAX_CHARS = 4000;

/** Une los chunks recuperados en un bloque, respetando un tope de caracteres. */
export function buildKnowledgeBlock(
  chunks: { text: string }[],
  maxChars = DEFAULT_MAX_CHARS,
): string {
  let out = "";
  for (const c of chunks) {
    const piece = c.text.trim();
    const addition = out ? `\n---\n${piece}` : piece;
    if (out.length + addition.length > maxChars) break;
    out += addition;
  }
  return out;
}

/**
 * Auto-RAG: embebe la consulta del cliente, recupera top-k chunks de la org
 * y devuelve un bloque de texto listo para inyectar al system prompt.
 * Si la org no tiene documentos o la query está vacía → '' (no gasta embeddings).
 */
export async function retrieveKnowledge(
  db: DB,
  orgId: string,
  query: string,
  deps: { embeddings: EmbeddingProvider },
  opts: { k?: number; maxChars?: number } = {},
): Promise<string> {
  if (!query.trim()) return "";
  if (!(await orgHasDocuments(db, orgId))) return "";
  const [queryEmbedding] = await deps.embeddings.embed([query]);
  const chunks = await retrieve(db, orgId, queryEmbedding, opts.k ?? DEFAULT_K);
  return buildKnowledgeBlock(chunks, opts.maxChars ?? DEFAULT_MAX_CHARS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/rag/index.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/rag/index.ts src/lib/agent/rag/index.test.ts
git commit -m "feat(rag): retrieveKnowledge + buildKnowledgeBlock orchestration"
```

---

## Task 11: context.ts — inyectar knowledge en el system prompt

**Files:**
- Modify: `src/lib/agent/context.ts`
- Modify: `src/lib/agent/context.test.ts`

- [ ] **Step 1: Añadir el test que falla**

En `src/lib/agent/context.test.ts`, dentro de `describe("context", ...)`, añade:

```ts
  it("inyecta el bloque de conocimiento cuando se provee", () => {
    const s = buildSystemPrompt({
      name: "Lula",
      systemPrompt: "Vendes cerveza.",
      knowledge: "El envío cuesta 5000 pesos.",
    });
    expect(s).toContain("Información de la empresa");
    expect(s).toContain("El envío cuesta 5000 pesos");
  });

  it("sin knowledge no añade el bloque de empresa", () => {
    const s = buildSystemPrompt({ name: "Lula", systemPrompt: "Vendes cerveza." });
    expect(s).not.toContain("Información de la empresa");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/context.test.ts`
Expected: FAIL (el objeto no acepta `knowledge` / no contiene "Información de la empresa").

- [ ] **Step 3: Extender buildSystemPrompt**

En `src/lib/agent/context.ts`, reemplaza la función `buildSystemPrompt` por:

```ts
export function buildSystemPrompt(config: {
  name: string;
  systemPrompt: string;
  knowledge?: string;
}): string {
  const base = `Eres ${config.name}, un asistente de WhatsApp.\n\n${config.systemPrompt}\n\n${GLOBAL_RULES}`;
  if (config.knowledge && config.knowledge.trim()) {
    return `${base}\n\nInformación de la empresa (úsala para responder; si la respuesta no está aquí, dilo o escala, no inventes):\n${config.knowledge.trim()}`;
  }
  return base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/context.test.ts`
Expected: PASS (todos, incluidos los 2 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context.ts src/lib/agent/context.test.ts
git commit -m "feat(rag): buildSystemPrompt accepts knowledge block"
```

---

## Task 12: turn.ts — auto-RAG antes del loop

**Files:**
- Modify: `src/lib/agent/turn.ts`
- Modify: `src/lib/agent/turn.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Primero revisa `src/lib/agent/turn.test.ts` para ver cómo se inyecta el provider falso y se siembra una conversación con mensajes. Añade un test que: siembra una org con un documento ingestado (fake embeddings), siembra una conversación con un mensaje entrante relevante, ejecuta `runAgentTurn` con un `LlmProvider` falso que **captura el `system`** recibido, y verifica que el system contiene el texto del documento.

```ts
  it("inyecta conocimiento de los documentos en el system (auto-RAG)", async () => {
    const { db } = makeTestDb();
    await seedOrgWithAgent(db, "org1"); // helper existente en este archivo o inline
    // Ingesta un doc con fake embeddings
    const { ingestDocument } = await import("./rag/ingest");
    const { makeFakeEmbeddings } = await import("./rag/testing/fake-embeddings");
    const embeddings = makeFakeEmbeddings();
    await ingestDocument(
      db,
      "org1",
      { name: "info", text: "El envio cuesta 5000 pesos.", source: "text" },
      { embeddings },
    );

    const conversationId = await seedConversationWithIncoming(db, "org1", "cuanto cuesta el envio");

    let capturedSystem = "";
    const provider = {
      async chat(input: { system: string }) {
        capturedSystem = input.system;
        return { text: "ok", toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } };
      },
    } as never;

    await runAgentTurn(db, "org1", conversationId, {
      provider,
      embeddings,
      sender: async () => ({ wamid: "w1" }),
      to: "57300",
    });

    expect(capturedSystem.toLowerCase()).toContain("envio");
  });
```

> Nota para el implementador: reutiliza los helpers de seeding que ya existan en `turn.test.ts`. Si no existen, créalos inline (insertar `agentConfigs` con `enabled: true`, una `conversations`, y un `messages` con `direction: "in"`). El patrón de seed de `agentConfigs`/`conversations` está en `config.test.ts` y `retrieve.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/turn.test.ts`
Expected: FAIL (`embeddings` no es un dep aceptado / el system no contiene "envio").

- [ ] **Step 3: Integrar auto-RAG en turn.ts**

En `src/lib/agent/turn.ts`:

(a) Añade imports:

```ts
import { getEmbeddingProvider } from "./rag/embeddings";
import type { EmbeddingProvider } from "./rag/embeddings/types";
import { retrieveKnowledge } from "./rag";
```

(b) Extiende el tipo de `deps` de `runAgentTurn` para aceptar un provider de embeddings opcional (inyectable en tests):

```ts
  deps: {
    provider?: LlmProvider;
    embeddings?: EmbeddingProvider;
    sender: AgentSender;
    to: string;
  },
```

(c) Después de construir `history` y antes del `try` del loop, calcula el bloque de conocimiento a partir del último mensaje entrante. Inserta:

```ts
  // Auto-RAG: recupera info de los documentos de la org relevante al último mensaje del cliente.
  const lastIncoming = rows.find((r) => r.direction === "in")?.body ?? "";
  let knowledge = "";
  if (lastIncoming.trim()) {
    try {
      const embeddings = deps.embeddings ?? getEmbeddingProvider();
      knowledge = await retrieveKnowledge(db, orgId, lastIncoming, { embeddings });
    } catch {
      // Falla de embeddings/RAG no debe romper el turno: seguimos sin conocimiento.
      knowledge = "";
    }
  }
```

> `rows` viene en orden `desc(createdAt)`, así que `rows.find(direction === "in")` es el mensaje entrante más reciente. (`history` ya hizo `rows.reverse()`; no reutilices `rows` invertido — usa el mismo `rows` antes de invertir, o calcula `lastIncoming` a partir de `history` con `.filter(...).at(-1)`.)

(d) Pasa `knowledge` a `buildSystemPrompt` dentro de `runAgentLoop`:

```ts
      system: buildSystemPrompt({
        name: config.name,
        systemPrompt: config.systemPrompt,
        knowledge,
      }),
```

> ⚠️ Cuidado con el orden: en el código actual `const history = toLlmHistory(rows.reverse())` **muta `rows`**. Para obtener el último entrante de forma segura, calcula `lastIncoming` a partir de `history`:
> ```ts
> const lastIncoming = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
> ```
> y úsalo en lugar de tocar `rows`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/turn.test.ts`
Expected: PASS (incluido el nuevo). Verifica que los tests previos de `turn.test.ts` siguen verdes (los que no siembran docs ven `knowledge=""` porque `orgHasDocuments` es false → no se llama embeddings).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/turn.ts src/lib/agent/turn.test.ts
git commit -m "feat(rag): auto-RAG injection in agent turn"
```

---

## Task 13: cost.ts — tarifa de embeddings

**Files:**
- Modify: `src/lib/agent/cost.ts`
- Modify: `src/lib/agent/cost.test.ts`

- [ ] **Step 1: Añadir el test que falla**

En `src/lib/agent/cost.test.ts` añade:

```ts
  it("estima el costo de embeddings (COP por 1k tokens)", () => {
    // 1000 tokens a la tarifa de embeddings → costo redondeado, no negativo, no cero.
    const cop = estimateEmbeddingCostCop(1000);
    expect(cop).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(cop)).toBe(true);
  });
```

Y al import del test añade `estimateEmbeddingCostCop`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/cost.test.ts`
Expected: FAIL ("estimateEmbeddingCostCop is not a function").

- [ ] **Step 3: Implementar la tarifa**

En `src/lib/agent/cost.ts`, añade al final:

```ts
// COP por 1k tokens de embeddings (text-embedding-3-small ≈ $0.02/1M tokens).
// Muy barato; tarifa conservadora editable.
const EMBEDDING_RATE_PER_1K = 0.1;

export function estimateEmbeddingCostCop(tokens: number): number {
  return Math.round((tokens / 1000) * EMBEDDING_RATE_PER_1K);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/cost.ts src/lib/agent/cost.test.ts
git commit -m "feat(rag): embedding cost estimator"
```

---

## Task 14: Tool opcional buscar_en_docs

**Files:**
- Create: `src/lib/agent/tools/builtin/buscar-en-docs.ts`
- Test: `src/lib/agent/tools/builtin/buscar-en-docs.test.ts`
- Modify: `src/lib/agent/tools/registry.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `src/lib/agent/tools/builtin/buscar-en-docs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { ingestDocument } from "@/lib/agent/rag/ingest";
import { makeFakeEmbeddings } from "@/lib/agent/rag/testing/fake-embeddings";
import { buscarEnDocs } from "./buscar-en-docs";

describe("buscar_en_docs", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  const embeddings = makeFakeEmbeddings();

  beforeEach(async () => {
    db = makeTestDb().db;
    await db.insert(organization).values({
      id: "org1",
      name: "org1",
      slug: "org1",
      createdAt: new Date(),
    });
    vi.spyOn(
      await import("@/lib/agent/rag/embeddings"),
      "getEmbeddingProvider",
    ).mockReturnValue(embeddings);
  });

  it("devuelve fragmentos relevantes", async () => {
    await ingestDocument(
      db,
      "org1",
      { name: "info", text: "El horario es de 9 a 6. El pago es en efectivo.", source: "text" },
      { embeddings },
    );
    const res = await buscarEnDocs.run(
      { query: "como puedo pagar" },
      { db, orgId: "org1", conversationId: "c1" },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(JSON.stringify(res.data).toLowerCase()).toContain("pago");
    }
  });

  it("org sin docs → ok con info vacía (no rompe)", async () => {
    const res = await buscarEnDocs.run(
      { query: "lo que sea" },
      { db, orgId: "org1", conversationId: "c1" },
    );
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/tools/builtin/buscar-en-docs.test.ts`
Expected: FAIL ("Cannot find module './buscar-en-docs'").

- [ ] **Step 3: Implementar el tool**

Create `src/lib/agent/tools/builtin/buscar-en-docs.ts`:

```ts
import { z } from "zod";
import { getEmbeddingProvider } from "@/lib/agent/rag/embeddings";
import { retrieveKnowledge } from "@/lib/agent/rag";
import type { AgentTool } from "../types";

const schema = z.object({
  query: z.string().min(1),
});

export const buscarEnDocs: AgentTool = {
  name: "buscar_en_docs",
  description:
    "Busca información en los documentos de la empresa (menú, políticas, FAQ, fichas). Úsalo cuando necesites datos específicos que el cliente pregunta y que pueden estar en la documentación.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Lo que quieres buscar en los documentos" },
    },
    required: ["query"],
  },
  escalates: false,
  async run(args, ctx) {
    const { query } = schema.parse(args);
    try {
      const embeddings = getEmbeddingProvider();
      const info = await retrieveKnowledge(ctx.db, ctx.orgId, query, { embeddings });
      return { ok: true, data: { info } };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "error buscando en documentos",
      };
    }
  },
};
```

- [ ] **Step 4: Registrar el tool**

En `src/lib/agent/tools/registry.ts`:
- Añade el import: `import { buscarEnDocs } from "./builtin/buscar-en-docs";`
- Añade a `BUILTIN_TOOLS`: `buscar_en_docs: buscarEnDocs,`

- [ ] **Step 5: Run test + registry test**

Run: `bunx vitest run src/lib/agent/tools/builtin/buscar-en-docs.test.ts src/lib/agent/tools/registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tools/builtin/buscar-en-docs.ts src/lib/agent/tools/builtin/buscar-en-docs.test.ts src/lib/agent/tools/registry.ts
git commit -m "feat(rag): buscar_en_docs tool + register"
```

---

## Task 15: Endpoint de subida de documentos

**Files:**
- Create: `src/app/api/agent/documents/route.ts`

- [ ] **Step 1: Implementar el endpoint POST**

Create `src/app/api/agent/documents/route.ts` (espejo del patrón de `src/app/api/products/[id]/images/route.ts`):

```ts
import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { saveMediaAsset } from "@/lib/media/store";
import { extractDocumentText } from "@/lib/agent/rag/extract";
import { ingestDocument } from "@/lib/agent/rag/ingest";
import { getEmbeddingProvider } from "@/lib/agent/rag/embeddings";
import { RAG_LIMITS } from "@/lib/agent/rag/limits";

export async function POST(req: Request): Promise<NextResponse> {
  const { orgId } = await requireOrg();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size > RAG_LIMITS.maxBytesPerDoc) {
    return NextResponse.json(
      { error: `Archivo muy grande (máx ${Math.round(RAG_LIMITS.maxBytesPerDoc / 1024 / 1024)}MB)` },
      { status: 413 },
    );
  }

  let text: string;
  try {
    text = await extractDocumentText(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No pude leer el archivo" },
      { status: 422 },
    );
  }

  // Guarda el original para referencia (opcional pero útil).
  const bytes = await file.arrayBuffer();
  const asset = await saveMediaAsset(db, {
    orgId,
    bytes,
    mime: file.type || "application/octet-stream",
    kind: "document",
  });

  try {
    const res = await ingestDocument(
      db,
      orgId,
      {
        name: file.name,
        text,
        source: "upload",
        mediaAssetId: asset.id,
        bytes: file.size,
      },
      { embeddings: getEmbeddingProvider() },
    );
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al indexar" },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 2: Verificar compilación**

Run: `bunx tsc --noEmit`
Expected: sin errores. (Si `saveMediaAsset` valida `kind`, "document" es libre — la columna es `text`. Verifica que no haya un enum estricto en el helper.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agent/documents/route.ts
git commit -m "feat(rag): document upload endpoint (extract + ingest)"
```

---

## Task 16: Acciones del panel (pegar texto / borrar)

**Files:**
- Modify: `src/app/(app)/configuracion/agente/actions.ts`

- [ ] **Step 1: Añadir las server actions**

En `src/app/(app)/configuracion/agente/actions.ts` añade los imports y las acciones:

```ts
import { ingestDocument } from "@/lib/agent/rag/ingest";
import { deleteDocument } from "@/lib/agent/rag/admin";
import { getEmbeddingProvider } from "@/lib/agent/rag/embeddings";
```

```ts
export async function addTextDocumentAction(input: {
  name: string;
  text: string;
}): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await ingestDocument(
      db,
      orgId,
      { name: input.name || "Documento", text: input.text, source: "text" },
      { embeddings: getEmbeddingProvider() },
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function deleteDocumentAction(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await deleteDocument(db, orgId, documentId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar compilación**

Run: `bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/configuracion/agente/actions.ts"
git commit -m "feat(rag): panel actions (add text doc / delete doc)"
```

---

## Task 17: Sección de panel Documentos

**Files:**
- Create: `src/app/(app)/configuracion/agente/_documents.tsx`
- Modify: `src/app/(app)/configuracion/agente/page.tsx`

- [ ] **Step 1: Crear el componente de sección**

Create `src/app/(app)/configuracion/agente/_documents.tsx` (cliente; espejo del estilo de `_products.tsx` / `_payments.tsx` — Card + lista + form). Usa subida de archivo vía `fetch("/api/agent/documents")` y pegar-texto vía `addTextDocumentAction`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { addTextDocumentAction, deleteDocumentAction } from "./actions";

const MAX_MB = 2;
const ACCEPT = ".pdf,.txt,.md,text/plain,text/markdown,application/pdf";

type DocItem = {
  id: string;
  name: string;
  status: "indexando" | "listo" | "error";
  chunkCount: number;
  source: "upload" | "text";
};

const STATUS: Record<DocItem["status"], { label: string; cls: string }> = {
  indexando: { label: "Indexando…", cls: "text-amber-600" },
  listo: { label: "Listo", cls: "text-emerald-600" },
  error: { label: "Error", cls: "text-red-600" },
};

export function AgentDocuments({ items }: { items: DocItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    for (const file of list) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`"${file.name}" supera ${MAX_MB} MB`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/agent/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? `No se pudo subir "${file.name}"`);
      } else {
        toast.success(`"${file.name}" indexado`);
      }
    }
    setUploading(false);
    router.refresh();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  }

  function onAddText() {
    start(async () => {
      const res = await addTextDocumentAction({ name, text });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Texto agregado");
      setName("");
      setText("");
      router.refresh();
    });
  }

  function onDelete(id: string) {
    start(async () => {
      const res = await deleteDocumentAction(id);
      if ("error" in res) toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Base de conocimiento</CardTitle>
        <CardDescription className="text-xs">
          Arrastra documentos (PDF, .txt, .md) o pega texto. El agente responderá con esta información. Máx 20 documentos, {MAX_MB} MB c/u.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone (arrastrar y soltar + click para explorar) */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={uploading}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          <UploadIcon className="size-6 text-muted-foreground" />
          <span className="text-sm font-medium">
            {uploading ? "Subiendo…" : "Arrastra archivos aquí o haz clic para explorar"}
          </span>
          <span className="text-xs text-muted-foreground">PDF, TXT o Markdown · máx {MAX_MB} MB</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </button>

        <div className="space-y-2 border-t border-border pt-4">
          <Input
            placeholder="Nombre (ej: Políticas de envío)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder="O pega aquí el texto…"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button onClick={onAddText} disabled={pending || !text.trim()} size="sm">
            Agregar texto
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>
          ) : (
            items.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{doc.name}</span>
                  <Badge variant="outline" className={STATUS[doc.status].cls}>
                    {STATUS[doc.status].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {doc.chunkCount} frag.
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(doc.id)}
                  disabled={pending}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

> Imports adicionales del componente: `useRef` (de `react`), `toast` (de `sonner`). Verifica que `@/components/ui/textarea` existe (usado en otras secciones). El drop zone soporta arrastrar-y-soltar **y** click; acepta múltiples archivos a la vez.

- [ ] **Step 2: Cablear en page.tsx**

En `src/app/(app)/configuracion/agente/page.tsx`:
- Import: `import { AgentDocuments } from "./_documents";`
- Import: `import { listDocuments } from "@/lib/agent/rag/admin";`
- Tras cargar `paymentList`, añade: `const documentList = await listDocuments(db, orgId);`
- En el JSX, después de `<AgentPayments items={paymentList} />`, añade:
  ```tsx
  <AgentDocuments
    items={documentList.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      chunkCount: d.chunkCount,
      source: d.source,
    }))}
  />
  ```

- [ ] **Step 3: Verificar compilación + build**

Run: `bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/configuracion/agente/_documents.tsx" "src/app/(app)/configuracion/agente/page.tsx"
git commit -m "feat(rag): panel Documentos section (upload/paste/list/delete)"
```

---

## Task 18: Gauntlet + review + merge + deploy

**Files:** ninguno (verificación)

- [ ] **Step 1: Suite completa de tests**

Run: `bunx vitest run`
Expected: todos los tests verdes (los ~430+ existentes + los nuevos de RAG).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: sin errores. Corrige `no-explicit-any` / imports no usados si aparecen.

- [ ] **Step 4: Build de producción**

Run: `bun run build`
Expected: build OK. (Parar cualquier proceso que tenga lock de la DB antes, si aplica.)

- [ ] **Step 5: Code review**

Pasa el diff por el subagent `code-reviewer` (o `/code-review`). Aplica los hallazgos accionables.

- [ ] **Step 6: Verificación manual (smoke)**

Con `OPENAI_API_KEY` en `.env.local`, levanta `bun run dev`, entra a `/configuracion/agente`, sube un PDF/txt corto, confirma estado "Listo" y nº de fragmentos, y haz una prueba de conversación cuyo dato sólo esté en el doc → el agente debe responder con esa info.

- [ ] **Step 7: Merge + deploy**

```bash
git checkout main
git merge --no-ff feat/agente-rag
```
Despliega con el flujo del proyecto (rsync `deploy@:/opt/...` o el `deploy.sh` correspondiente; recuerda correr `bun run db:migrate` en el server para aplicar la migración 0022). Documento OFF por defecto: la base vacía no cambia el comportamiento del agente.

- [ ] **Step 8: Actualizar memoria**

Actualiza `project_wa_blast_agente_ia.md`: RAG/base documental desplegado (migración 0022, módulo bajo Premium), formatos txt/md/PDF, límites 20/2MB/1500, auto-RAG + tool `buscar_en_docs`.

---

## Self-Review (cobertura del spec)

- ✅ **Embeddings OpenAI modular** → Task 5 (`EmbeddingProvider` + OpenAI + factory).
- ✅ **Vector store coseno-en-JS sobre sqlite** → Task 2 (schema), Task 4 (coseno), Task 7 (retrieve).
- ✅ **Auto-RAG en contexto** → Task 10 (orquestación), Task 11 (context), Task 12 (turn).
- ✅ **Tool opcional buscar_en_docs** → Task 14.
- ✅ **Formatos txt/md/PDF** → Task 1 (unpdf), Task 6 (extract).
- ✅ **Límites 20/2MB/1500** → Task 1 (constantes), Task 9 (enforcement), Task 15 (endpoint).
- ✅ **Chunking** → Task 3.
- ✅ **Ingesta con estado indexando/listo/error** → Task 9.
- ✅ **Panel subir/pegar/listar/eliminar** → Tasks 15–17.
- ✅ **Cost tracking embeddings** → Task 13.
- ✅ **Multi-tenant orgId estricto** → Tasks 7, 8 (tests de aislamiento).
- ✅ **Testing** (chunk puro, retrieve sembrado, provider mock, ingest e2e con fake, auto-RAG) → Tasks 3–12.

**Consistencia de tipos verificada:** `EmbeddingProvider.embed(texts) → number[][]`, `model`, `dims` usados igual en openai/fake/ingest/index. `retrieve(db, orgId, number[], k) → RetrievedChunk[]`. `ingestDocument(db, orgId, input, deps)`. `retrieveKnowledge(db, orgId, query, {embeddings}, opts)`. `buildSystemPrompt({name, systemPrompt, knowledge?})`. Tablas `agentDocuments`/`documentChunks` con los mismos campos en schema, seeds de test e ingest.
