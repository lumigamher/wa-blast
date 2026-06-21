# Spec: Agente IA — RAG / base documental (multi-tenant)

**Fecha:** 2026-06-21
**Estado:** spec (diseño) — **pendiente confirmar decisiones pivote + escribir plan + construir (próxima sesión)**
**Sub-proyecto:** capacidad que se enchufa al motor del Agente IA (ver `project_wa_blast_agente_ia`).

## Contexto

El Agente IA de Lula (wa-blast) ya está desplegado con A–I + envío de fotos: motor agéntico determinístico, integración WhatsApp, panel Premium, agenda, catálogo (interno/HTTP/Shopify), pagos (manual+comprobante, EfiPay, checkout Flow), variantes+imágenes. Falta **RAG**: que cada org suba documentos (menú, políticas, FAQ, fichas técnicas, condiciones) y el agente responda con **la info real de la empresa**, no solo lo que esté en el prompt.

Stack relevante: DB **sqlite** (Drizzle, better-sqlite3, local en el VPS). IA ya integrada: OpenAI (`flow-ai.ts`, `OPENAI_API_KEY` en env) + Anthropic. Media/upload: `saveMediaAsset` (Plan I lo usa). Motor: `context.ts` arma el system prompt + historial antes del loop; tools en `registry.ts`.

## Objetivo / No-objetivo

**Objetivo:** por org, subir documentos → trocear (chunk) → generar embeddings → guardar → en cada turno, recuperar los fragmentos relevantes a la consulta del cliente e inyectarlos al contexto del agente (o vía un tool `buscar_en_docs`). Panel para gestionar documentos.

**No-objetivo (v1):** OCR de imágenes escaneadas, web-crawling de sitios, re-ranking avanzado, multi-idioma cross-lingual. (Se pueden añadir después.)

## Decisiones pivote — CONFIRMAR al inicio de la próxima sesión

### 1. Provider de embeddings (recomendado: modular, default OpenAI)
- **OpenAI `text-embedding-3-small`** (recomendado v1): reusa `OPENAI_API_KEY` ya en prod, barato (~$0.02/1M tokens), 1536 dims, calidad buena para español. Cero infra nueva.
- Local (Transformers.js / bge-small): sin costo por token ni dependencia externa, pero suma peso/CPU al VPS y un modelo a cargar.
- **Diseño:** abstracción `EmbeddingProvider` (igual patrón que LlmProvider/CalendarProvider/CatalogProvider) → default OpenAI, local enchufable después. **Decisión: ¿default OpenAI? (recomendado sí).**

### 2. Almacenamiento del vector (recomendado: en sqlite, similitud en JS)
- DB es sqlite → no hay pgvector. Opciones:
  - **(Recomendado v1)** Guardar el embedding como **blob/JSON** en una tabla `document_chunks` y hacer **cosine similarity en JS** sobre los chunks de la org. Para volúmenes PYME (cientos–miles de chunks por org) es suficiente y simple; cero dependencias.
  - `sqlite-vec` (extensión de búsqueda vectorial para sqlite): más escalable, pero suma una extensión nativa al build/deploy.
  - Migrar a Postgres+pgvector: fuera de alcance v1 (gran cambio de infra).
- **Decisión: ¿cosine-en-JS sobre sqlite para v1? (recomendado sí; escala suficiente para PYMEs, y la abstracción del retriever permite cambiar a sqlite-vec/pgvector luego sin tocar tools).**

### 3. Cómo se inyecta el contexto recuperado (recomendado: auto-RAG en el contexto)
- **(Recomendado)** Auto-RAG: antes del loop, `context.ts` toma el último mensaje del cliente, recupera top-k chunks y los inyecta como bloque "Información de la empresa:" en el system prompt. Transparente, el agente siempre tiene la info.
- Alternativa: un tool `buscar_en_docs(query)` que el LLM llama cuando lo necesita. Más control/determinismo de cuándo, pero el LLM puede olvidar llamarlo.
- **Decisión: ¿auto-RAG en contexto, tool, o ambos? (recomendado auto-RAG + opcionalmente el tool para búsquedas explícitas).**

## Arquitectura (modular, in-process)

```
Subida doc (panel) → ingest: extrae texto → chunk (≈500–800 tokens, solape) → embed (EmbeddingProvider) → guarda chunks+embeddings
Turno del agente → buildContext: embed(últimoMensajeCliente) → retriever.topK(orgId, queryEmbedding, k) → inyecta los chunks al system prompt
```

- `src/lib/agent/rag/embeddings/{types,openai}.ts` — `EmbeddingProvider` { embed(texts: string[]) → number[][] }; impl OpenAI.
- `src/lib/agent/rag/chunk.ts` — `chunkText(text, opts)` (puro, testeable).
- `src/lib/agent/rag/extract.ts` — extrae texto de un archivo (txt/markdown directo; PDF vía una lib; v1 puede empezar con txt/markdown + pegar texto, PDF como fast-follow).
- `src/lib/agent/rag/ingest.ts` — `ingestDocument(db, orgId, {name, text})`: chunk → embed → insert chunks.
- `src/lib/agent/rag/retrieve.ts` — `retrieve(db, orgId, queryEmbedding, k)`: cosine sobre los chunks de la org (en JS), top-k. (Abstracción para cambiar a sqlite-vec luego.)
- `context.ts` (MOD) — auto-RAG: recupera e inyecta.
- (opcional) tool `buscar_en_docs`.
- Panel `/configuracion/agente` — sección Documentos (subir/pegar, listar, eliminar; estado de indexado).

## Modelo de datos (sqlite/Drizzle)

- `agent_documents` (id, orgId, name, source ["upload"|"text"], bytes/mediaAssetId opcional, status ["indexando"|"listo"|"error"], chunkCount, createdAt).
- `document_chunks` (id, orgId, documentId, idx, text, embedding **blob** (Float32Array serializado) o text JSON, createdAt). Índice por (orgId).

## Determinismo / seguridad / costo
- Embeddings cacheados (no re-embeber chunks sin cambios). Tope de tamaño de doc + nº docs por org (o por plan).
- Costo de embeddings se suma a `agent_runs`/cost tracking (extender `cost.ts` con tarifa de embeddings).
- Multi-tenant: chunks por orgId; retrieve filtra orgId estricto.
- Inyección acotada (k chunks, límite de tokens) para no inflar el prompt ni el costo.

## Testing
- `chunkText` puro (solape, límites). `retrieve` con embeddings sembrados (cosine determinístico, top-k correcto, scoping orgId). `EmbeddingProvider` con fetch mock (mapeo de la respuesta OpenAI). `ingest` end-to-end con embedding provider falso. Auto-RAG: contexto incluye los chunks recuperados.

## Plan de fases (para writing-plans la próxima sesión)
1. Schema (`agent_documents`, `document_chunks`) + EmbeddingProvider (OpenAI) + chunker.
2. Ingest + retrieve (cosine JS) + tests.
3. Integración: auto-RAG en `context.ts` (+ opcional tool `buscar_en_docs`).
4. Panel: sección Documentos (subir/pegar/listar/eliminar) + endpoint de subida (reusa `saveMediaAsset` + extracción).
5. Gauntlet + review + merge + deploy.

## Decisiones rápidas a confirmar (resumen)
1. Embeddings default = **OpenAI** (modular). ¿OK?
2. Vector store v1 = **cosine en JS sobre sqlite** (retriever abstracto). ¿OK?
3. Inyección = **auto-RAG en contexto** (+ tool opcional). ¿OK?
4. Formatos v1 = **texto pegado + .txt/.md** (PDF como fast-follow). ¿OK o PDF desde el inicio?
5. Límites por plan (nº docs / tamaño) — definir cifras.

> Al retomar: confirmar 1–5, invocar `writing-plans` con este spec, y construir con el patrón rama→subagentes TDD→review→merge→deploy.
