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
