import { describe, expect, test, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { inboxMediaCache } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";
import { ensureInboundMedia } from "@/lib/media/inbound";

async function seedOrg() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  return db;
}

describe("ensureInboundMedia", () => {
  test("cache hit returns assetId without fetching", async () => {
    const db = await seedOrg();
    const dir = mkdtempSync(join(tmpdir(), "wablast-media-"));
    const bytes = new TextEncoder().encode("cached").buffer;
    const asset = await saveMediaAsset(db, { orgId: "o", bytes, mime: "image/jpeg", dir });

    // Pre-insert cache row
    await db.insert(inboxMediaCache).values({
      metaMediaId: "m123",
      orgId: "o",
      assetId: asset.id,
      createdAt: new Date(),
    });

    // Spy on fetch to verify it's NOT called
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await ensureInboundMedia(db, {
      orgId: "o",
      metaMediaId: "m123",
      accessToken: "token",
    });

    expect(result).toBe(asset.id);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("cache miss downloads and caches", async () => {
    const db = await seedOrg();
    const dir = mkdtempSync(join(tmpdir(), "wablast-media-"));
    process.env.MEDIA_DIR = dir;

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Mock fetch: first call for metadata, second for file download
    const imageData = new TextEncoder().encode("fake image").buffer;
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // Metadata endpoint
        return new Response(
          JSON.stringify({
            url: "https://example.com/file.jpg",
            mime_type: "image/jpeg",
          }),
          { status: 200 }
        );
      } else {
        // File download
        return new Response(imageData, { status: 200 });
      }
    });

    const result = await ensureInboundMedia(db, {
      orgId: "o",
      metaMediaId: "m456",
      accessToken: "token",
    });

    expect(result).toBeDefined();
    expect(result).toMatch(/^media_/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify cache row was inserted
    const cached = await db
      .select()
      .from(inboxMediaCache)
      .then((rows) => rows[0]);
    expect(cached).toBeDefined();
    expect(cached?.metaMediaId).toBe("m456");
    expect(cached?.assetId).toBe(result);

    fetchSpy.mockRestore();
  });

  test("directUrl descarga directo sin llamar a metadata", async () => {
    const db = await seedOrg();
    const dir = mkdtempSync(join(tmpdir(), "wablast-media-"));
    process.env.MEDIA_DIR = dir;

    const imageData = new TextEncoder().encode("direct image").buffer;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(new Response(imageData, { status: 200 }));

    const result = await ensureInboundMedia(db, {
      orgId: "o",
      metaMediaId: "mDirect",
      accessToken: "token",
      directUrl: "https://lookaside.fbsbx.com/x?source=webhook",
      mime: "image/jpeg",
    });

    expect(result).toMatch(/^media_/);
    // Una sola llamada (la descarga directa), NO el GET de metadata
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("lookaside.fbsbx.com");
    fetchSpy.mockRestore();
  });

  test("directUrl que falla cae al metadata (fallback)", async () => {
    const db = await seedOrg();
    const dir = mkdtempSync(join(tmpdir(), "wablast-media-"));
    process.env.MEDIA_DIR = dir;

    const imageData = new TextEncoder().encode("fallback image").buffer;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let n = 0;
    fetchSpy.mockImplementation(async (input) => {
      n++;
      if (String(input).includes("lookaside")) return new Response(null, { status: 410 }); // url expirado
      if (String(input).includes("graph.facebook.com")) return new Response(JSON.stringify({ url: "https://cdn/x.jpg", mime_type: "image/jpeg" }), { status: 200 });
      return new Response(imageData, { status: 200 }); // descarga del cdn
    });

    const result = await ensureInboundMedia(db, {
      orgId: "o",
      metaMediaId: "mFallback",
      accessToken: "token",
      directUrl: "https://lookaside.fbsbx.com/expired",
      mime: "image/jpeg",
    });

    expect(result).toMatch(/^media_/);
    expect(n).toBe(3); // directUrl(falla) + metadata + descarga cdn
    fetchSpy.mockRestore();
  });

  test("no accessToken returns null", async () => {
    const db = await seedOrg();

    const result = await ensureInboundMedia(db, {
      orgId: "o",
      metaMediaId: "m789",
      accessToken: null,
    });

    expect(result).toBeNull();
  });

  test("fetch failure returns null (best-effort)", async () => {
    const db = await seedOrg();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const result = await ensureInboundMedia(db, {
      orgId: "o",
      metaMediaId: "m999",
      accessToken: "token",
    });

    expect(result).toBeNull();
    fetchSpy.mockRestore();
  });

  test("wrong org cache not returned", async () => {
    const db = await seedOrg();
    // Create another org
    await db.insert(organization).values({ id: "other-org", name: "Other", createdAt: new Date() });

    const dir = mkdtempSync(join(tmpdir(), "wablast-media-"));
    const bytes = new TextEncoder().encode("cached").buffer;
    const asset = await saveMediaAsset(db, {
      orgId: "other-org",
      bytes,
      mime: "image/jpeg",
      dir,
    });

    // Pre-insert cache row for different org
    await db.insert(inboxMediaCache).values({
      metaMediaId: "m111",
      orgId: "other-org",
      assetId: asset.id,
      createdAt: new Date(),
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const imageData = new TextEncoder().encode("new image").buffer;
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            url: "https://example.com/file.jpg",
            mime_type: "image/jpeg",
          }),
          { status: 200 }
        );
      } else {
        return new Response(imageData, { status: 200 });
      }
    });

    const result = await ensureInboundMedia(db, {
      orgId: "o",
      metaMediaId: "m111",
      accessToken: "token",
    });

    expect(result).toBeDefined();
    expect(result).not.toBe(asset.id); // Should be a new asset
    fetchSpy.mockRestore();
  });
});
