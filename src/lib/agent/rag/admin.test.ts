import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, agentDocuments, documentChunks } from "@/lib/db/schema";
import { serializeEmbedding } from "./vector";
import { countChunks, countDocuments, deleteDocument, listDocuments, orgHasDocuments } from "./admin";

function makeOrg(db: ReturnType<typeof makeTestDb>["db"], orgId: string) {
  return db.insert(organization).values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
}
async function makeDoc(db: ReturnType<typeof makeTestDb>["db"], orgId: string, name: string, chunks: number) {
  const docId = randomUUID();
  await db.insert(agentDocuments).values({
    id: docId, orgId, name, source: "text", status: "listo", chunkCount: chunks, bytes: 0, createdAt: new Date(),
  });
  for (let i = 0; i < chunks; i++) {
    await db.insert(documentChunks).values({
      id: randomUUID(), orgId, documentId: docId, idx: i, text: `chunk ${i}`,
      embedding: serializeEmbedding([1, 0]), createdAt: new Date(),
    });
  }
  return docId;
}

describe("rag/admin", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeEach(async () => { db = makeTestDb().db; await makeOrg(db, "org1"); });

  it("listDocuments devuelve los docs de la org", async () => {
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
  it("deleteDocument borra doc + chunks (cascade), scoping orgId", async () => {
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
