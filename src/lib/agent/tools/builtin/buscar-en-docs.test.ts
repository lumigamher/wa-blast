import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { ingestDocument } from "@/lib/agent/rag/ingest";
import { makeFakeEmbeddings } from "@/lib/agent/rag/testing/fake-embeddings";
import { buscarEnDocs } from "./buscar-en-docs";

describe("buscar_en_docs", () => {
  let db: ReturnType<typeof makeTestDb>;
  const embeddings = makeFakeEmbeddings();

  beforeEach(async () => {
    db = makeTestDb();
    await db.db.insert(organization).values({
      id: "org1",
      name: "org1",
      slug: "org1",
      createdAt: new Date(),
    });
    vi.spyOn(await import("@/lib/agent/rag/embeddings"), "getEmbeddingProvider").mockReturnValue(embeddings);
  });

  it("devuelve fragmentos relevantes", async () => {
    await ingestDocument(
      db.db,
      "org1",
      {
        name: "info",
        text: "El horario es de 9 a 6. El pago es en efectivo.",
        source: "text",
      },
      { embeddings },
    );
    const res = await buscarEnDocs.run(
      { query: "como puedo pagar" },
      { db: db.db, orgId: "org1", conversationId: "c1" },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(JSON.stringify(res.data).toLowerCase()).toContain("pago");
    }
  });

  it("org sin docs → ok con info vacía (no rompe)", async () => {
    const res = await buscarEnDocs.run(
      { query: "lo que sea" },
      { db: db.db, orgId: "org1", conversationId: "c1" },
    );
    expect(res.ok).toBe(true);
  });
});
