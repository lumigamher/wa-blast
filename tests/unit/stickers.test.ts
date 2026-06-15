import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { addSticker, deleteSticker, listStickers } from "@/lib/inbox/stickers";
import type { DB } from "@/lib/db/client";

async function seed(db: DB, id = "o1") {
  await db
    .insert(organization)
    .values({ id, name: id, slug: id, createdAt: new Date() });
}

describe("stickers", () => {
  it("añade y lista por org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    const s = await addSticker(db, "o1", { webp: new Uint8Array([82, 73, 70, 70]), dir });
    const rows = await listStickers(db, "o1");
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(s.id);
    expect(rows[0].assetId).toBeTruthy();
  });

  it("aislamiento y borrado por org", async () => {
    const { db } = makeTestDb();
    await seed(db, "o1");
    await seed(db, "o2");
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    const s = await addSticker(db, "o1", { webp: new Uint8Array([82, 73, 70, 70]), dir });
    expect((await listStickers(db, "o2")).length).toBe(0);
    await deleteSticker(db, "o2", s.id);
    expect((await listStickers(db, "o1")).length).toBe(1);
    await deleteSticker(db, "o1", s.id);
    expect((await listStickers(db, "o1")).length).toBe(0);
  });
});
