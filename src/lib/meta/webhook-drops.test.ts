import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { webhookDrops } from "@/lib/db/schema";
import { countRecentDrops, pruneOldDrops, recordWebhookDrop } from "./webhook-drops";

describe("webhook drops", () => {
  it("registra el payload rechazado con su motivo", async () => {
    const { db } = makeTestDb();
    await recordWebhookDrop(db, { reason: "from: Required", rawBody: '{"entry":[]}' });
    const rows = await db.select().from(webhookDrops);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toContain("from");
    expect(rows[0].rawBody).toBe('{"entry":[]}');
  });

  it("nunca lanza: registrar un descarte no puede tumbar el webhook", async () => {
    const { db, sqlite } = makeTestDb();
    sqlite.exec("DROP TABLE webhook_drops");
    await expect(recordWebhookDrop(db, { reason: "x", rawBody: "y" })).resolves.toBeUndefined();
  });

  it("recorta el payload gigante para no inflar la base", async () => {
    const { db } = makeTestDb();
    await recordWebhookDrop(db, { reason: "x", rawBody: "a".repeat(50_000) });
    const [row] = await db.select().from(webhookDrops);
    expect(row.rawBody.length).toBeLessThanOrEqual(10_000);
  });

  it("cuenta los descartes recientes para mostrarlos en Salud", async () => {
    const { db } = makeTestDb();
    await recordWebhookDrop(db, { reason: "a", rawBody: "1" });
    await recordWebhookDrop(db, { reason: "b", rawBody: "2" });
    expect(await countRecentDrops(db, 24)).toBe(2);
  });

  it("borra los descartes viejos (retención corta: llevan datos personales)", async () => {
    const { db } = makeTestDb();
    const viejo = new Date(Date.now() - 15 * 24 * 3600 * 1000);
    await db.insert(webhookDrops).values({ id: "d1", reason: "a", rawBody: "1", createdAt: viejo });
    await recordWebhookDrop(db, { reason: "b", rawBody: "2" });
    await pruneOldDrops(db, 7);
    const rows = await db.select().from(webhookDrops);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("b");
  });
});
