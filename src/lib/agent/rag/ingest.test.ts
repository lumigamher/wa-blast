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
    await db.insert(organization).values({ id: "org1", name: "org1", slug: "org1", createdAt: new Date() });
  });

  it("trocea, embebe e inserta chunks; marca el doc listo", async () => {
    const text = "El menu tiene precio especial. ".repeat(200);
    const res = await ingestDocument(db, "org1", { name: "menu.txt", text, source: "text" }, { embeddings });
    expect(res.chunkCount).toBeGreaterThan(0);
    expect(await countChunks(db, "org1")).toBe(res.chunkCount);
    const docs = await listDocuments(db, "org1");
    expect(docs[0].status).toBe("listo");
    expect(docs[0].chunkCount).toBe(res.chunkCount);
    expect(docs[0].name).toBe("menu.txt");
  });
  it("rechaza si supera maxDocsPerOrg", async () => {
    const tiny = { name: "x", text: "hola", source: "text" as const };
    const limits = { maxDocsPerOrg: 2, maxBytesPerDoc: 999999, maxChunksPerOrg: 999999 };
    for (let i = 0; i < 2; i++) await ingestDocument(db, "org1", tiny, { embeddings, limits });
    await expect(ingestDocument(db, "org1", tiny, { embeddings, limits })).rejects.toThrow(/límite|limite|máximo|maximo/i);
    expect(await countDocuments(db, "org1")).toBe(2);
  });
  it("texto vacío → error sin crear doc", async () => {
    await expect(ingestDocument(db, "org1", { name: "v", text: "   ", source: "text" }, { embeddings })).rejects.toThrow(/vac/i);
    expect(await countDocuments(db, "org1")).toBe(0);
  });
});
