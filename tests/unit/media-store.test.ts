import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { saveMediaAsset, getMediaAsset } from "@/lib/media/store";

async function seedOrg() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  return db;
}

describe("media store", () => {
  test("save writes file + row, get returns it", async () => {
    const db = await seedOrg();
    const dir = mkdtempSync(join(tmpdir(), "wablast-media-"));
    const bytes = new TextEncoder().encode("hello").buffer;
    const asset = await saveMediaAsset(db, { orgId: "o", bytes, mime: "image/png", dir });
    expect(asset.kind).toBe("image");
    expect(readFileSync(join(dir, asset.id)).toString()).toBe("hello");
    const got = await getMediaAsset(db, asset.id);
    expect(got?.id).toBe(asset.id);
  });
});
