import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, organizationSettings } from "@/lib/db/schema";
import { verifyWebhookToken } from "@/lib/webhook/verify";

async function setupTest(db: ReturnType<typeof makeTestDb>["db"]) {
  const orgId = "test-org-webhook";

  // Create organization
  await db.insert(organization).values({
    id: orgId,
    name: "Test Org",
    slug: "test-org-webhook",
    createdAt: new Date(),
  });

  // Create settings with metaVerifyToken and NULL webhookVerifiedAt
  await db.insert(organizationSettings).values({
    orgId,
    metaVerifyToken: "tok1",
    updatedAt: new Date(),
  });

  return { db, orgId };
}

describe("webhook verify stamp", () => {
  it("estampa webhookVerifiedAt en la primera verificación", async () => {
    const { db, orgId } = await setupTest(makeTestDb().db);

    const settings = await verifyWebhookToken(db, "tok1");
    expect(settings).toBeDefined();
    expect(settings?.orgId).toBe(orgId);

    // Verificar que se estampó
    const [updated] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.orgId, orgId));
    expect(updated.webhookVerifiedAt).not.toBeNull();
  });

  it("segunda llamada NO cambia el timestamp", async () => {
    const { db, orgId } = await setupTest(makeTestDb().db);

    // Primera llamada
    await verifyWebhookToken(db, "tok1");
    const [first] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.orgId, orgId));
    const firstStamp = first.webhookVerifiedAt;

    // Segunda llamada después de un pequeño delay
    await new Promise((r) => setTimeout(r, 100));
    await verifyWebhookToken(db, "tok1");
    const [second] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.orgId, orgId));

    expect(second.webhookVerifiedAt).toEqual(firstStamp);
  });

  it("token inválido lanza error sin stamp", async () => {
    const { db } = await setupTest(makeTestDb().db);

    await expect(verifyWebhookToken(db, "invalid-token")).rejects.toThrow();
  });

  it("si webhookVerifiedAt ya tiene valor, NO lo actualiza", async () => {
    const { db, orgId } = await setupTest(makeTestDb().db);

    const pastDate = new Date("2024-01-01");
    await db
      .update(organizationSettings)
      .set({ webhookVerifiedAt: pastDate })
      .where(eq(organizationSettings.orgId, orgId));

    await verifyWebhookToken(db, "tok1");

    const [updated] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.orgId, orgId));

    expect(updated.webhookVerifiedAt).toEqual(pastDate);
  });
});
