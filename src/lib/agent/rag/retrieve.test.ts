import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, agentDocuments, documentChunks } from "@/lib/db/schema";
import { serializeEmbedding } from "./vector";
import { retrieve } from "./retrieve";

async function seedOrg(db: ReturnType<typeof makeTestDb>["db"], orgId: string) {
  await db.insert(organization).values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
  const docId = randomUUID();
  await db.insert(agentDocuments).values({
    id: docId, orgId, name: "doc", source: "text", status: "listo",
    chunkCount: 0, bytes: 0, createdAt: new Date(),
  });
  return docId;
}
async function addChunk(db: ReturnType<typeof makeTestDb>["db"], orgId: string, documentId: string, idx: number, text: string, embedding: number[]) {
  await db.insert(documentChunks).values({
    id: randomUUID(), orgId, documentId, idx, text,
    embedding: serializeEmbedding(embedding), createdAt: new Date(),
  });
}

describe("retrieve", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeEach(() => { db = makeTestDb().db; });

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
  it("aísla por orgId", async () => {
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
