import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { makeFakeEmbeddings } from "./testing/fake-embeddings";
import { ingestDocument } from "./ingest";
import { buildKnowledgeBlock, retrieveKnowledge } from "./index";

describe("buildKnowledgeBlock", () => {
  it("une chunks con separador y respeta el tope de chars", () => {
    const block = buildKnowledgeBlock([{ text: "uno" }, { text: "dos" }, { text: "tres" }], 9);
    expect(block).toContain("uno");
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
    await db.insert(organization).values({ id: "org1", name: "org1", slug: "org1", createdAt: new Date() });
  });
  it("org sin documentos → '' (no llama embeddings)", async () => {
    expect(await retrieveKnowledge(db, "org1", "precio del menu", { embeddings })).toBe("");
  });
  it("recupera el chunk relevante a la consulta", async () => {
    await ingestDocument(db, "org1", { name: "info", text: "El horario es de 9 a 6.\n\nEl envio cuesta 5000 pesos.", source: "text" }, { embeddings });
    const out = await retrieveKnowledge(db, "org1", "cuánto cuesta el envio", { embeddings }, { k: 1 });
    expect(out.toLowerCase()).toContain("envio");
  });
  it("query vacía → ''", async () => {
    expect(await retrieveKnowledge(db, "org1", "   ", { embeddings })).toBe("");
  });
});
