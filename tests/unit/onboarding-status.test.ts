import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaigns, organization, organizationSettings, user } from "@/lib/db/schema";
import { getOnboardingStatus } from "@/lib/onboarding/status";

async function setupTest(db: ReturnType<typeof makeTestDb>["db"]) {
  const orgId = "test-org-onboarding";
  const userId = "test-user-onboarding";

  // Create organization
  await db.insert(organization).values({
    id: orgId,
    name: "Test Org Onboarding",
    slug: "test-org-onboarding",
    createdAt: new Date(),
  });

  // Create user
  await db.insert(user).values({
    id: userId,
    email: "test-onboarding@example.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create empty settings
  await db.insert(organizationSettings).values({
    orgId,
    updatedAt: new Date(),
  });

  return { db, orgId, userId };
}

describe("getOnboardingStatus", () => {
  it("org virgen → todos los steps false, nextStep 1", async () => {
    const { db, orgId } = await setupTest(makeTestDb().db);

    const status = await getOnboardingStatus(db, orgId);

    expect(status.steps.creds).toBe(false);
    expect(status.steps.credsVerified).toBe(false);
    expect(status.steps.webhookVerified).toBe(false);
    expect(status.steps.testMessage).toBe(false);
    expect(status.steps.firstCampaign).toBe(false);
    expect(status.complete).toBe(false);
    expect(status.nextStep).toBe(1);
  });

  it("creds presentes sin verificar → creds true, credsVerified false, nextStep 1", async () => {
    const { db, orgId } = await setupTest(makeTestDb().db);

    // Add creds without verification timestamps
    await db
      .update(organizationSettings)
      .set({
        metaPhoneId: "123456789",
        metaWabaId: "987654321",
        metaAppId: "app123",
        metaAccessTokenEnc: "token-enc",
        metaAppSecretEnc: "secret-enc",
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));

    const status = await getOnboardingStatus(db, orgId);

    expect(status.steps.creds).toBe(true);
    expect(status.steps.credsVerified).toBe(false);
    expect(status.steps.webhookVerified).toBe(false);
    expect(status.steps.testMessage).toBe(false);
    expect(status.steps.firstCampaign).toBe(false);
    expect(status.complete).toBe(false);
    expect(status.nextStep).toBe(1);
  });

  it("creds+verified sin webhook → nextStep 2", async () => {
    const { db, orgId } = await setupTest(makeTestDb().db);

    const now = new Date();
    await db
      .update(organizationSettings)
      .set({
        metaPhoneId: "123456789",
        metaWabaId: "987654321",
        metaAppId: "app123",
        metaAccessTokenEnc: "token-enc",
        metaAppSecretEnc: "secret-enc",
        metaVerifiedAt: now,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));

    const status = await getOnboardingStatus(db, orgId);

    expect(status.steps.creds).toBe(true);
    expect(status.steps.credsVerified).toBe(true);
    expect(status.steps.webhookVerified).toBe(false);
    expect(status.steps.testMessage).toBe(false);
    expect(status.steps.firstCampaign).toBe(false);
    expect(status.complete).toBe(false);
    expect(status.nextStep).toBe(2);
  });

  it("todos los 3 timestamps + campaña non-draft → complete true, nextStep null", async () => {
    const { db, orgId, userId } = await setupTest(makeTestDb().db);

    const now = new Date();
    await db
      .update(organizationSettings)
      .set({
        metaPhoneId: "123456789",
        metaWabaId: "987654321",
        metaAppId: "app123",
        metaAccessTokenEnc: "token-enc",
        metaAppSecretEnc: "secret-enc",
        metaVerifiedAt: now,
        webhookVerifiedAt: now,
        testMessageSentAt: now,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));

    // Create a non-draft campaign
    await db.insert(campaigns).values({
      id: "campaign-1",
      orgId,
      name: "First Campaign",
      templateName: "test_template",
      templateLanguage: "en",
      headerType: "NONE",
      source: "api",
      status: "sent",
      total: 1,
      sent: 1,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
      createdBy: userId,
      createdAt: new Date(),
    });

    const status = await getOnboardingStatus(db, orgId);

    expect(status.steps.creds).toBe(true);
    expect(status.steps.credsVerified).toBe(true);
    expect(status.steps.webhookVerified).toBe(true);
    expect(status.steps.testMessage).toBe(true);
    expect(status.steps.firstCampaign).toBe(true);
    expect(status.complete).toBe(true);
    expect(status.nextStep).toBe(null);
  });

  it("draft campaign no cuenta como firstCampaign", async () => {
    const { db, orgId, userId } = await setupTest(makeTestDb().db);

    const now = new Date();
    await db
      .update(organizationSettings)
      .set({
        metaPhoneId: "123456789",
        metaWabaId: "987654321",
        metaAppId: "app123",
        metaAccessTokenEnc: "token-enc",
        metaAppSecretEnc: "secret-enc",
        metaVerifiedAt: now,
        webhookVerifiedAt: now,
        testMessageSentAt: now,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));

    // Create only a draft campaign
    await db.insert(campaigns).values({
      id: "campaign-draft",
      orgId,
      name: "Draft Campaign",
      templateName: "test_template",
      templateLanguage: "en",
      headerType: "NONE",
      source: "api",
      status: "draft",
      total: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
      createdBy: userId,
      createdAt: new Date(),
    });

    const status = await getOnboardingStatus(db, orgId);

    expect(status.steps.firstCampaign).toBe(false);
    expect(status.complete).toBe(false);
    expect(status.nextStep).toBe(4);
  });

  it("creds+verified+webhook sin test message → nextStep 3", async () => {
    const { db, orgId } = await setupTest(makeTestDb().db);

    const now = new Date();
    await db
      .update(organizationSettings)
      .set({
        metaPhoneId: "123456789",
        metaWabaId: "987654321",
        metaAppId: "app123",
        metaAccessTokenEnc: "token-enc",
        metaAppSecretEnc: "secret-enc",
        metaVerifiedAt: now,
        webhookVerifiedAt: now,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));

    const status = await getOnboardingStatus(db, orgId);

    expect(status.steps.creds).toBe(true);
    expect(status.steps.credsVerified).toBe(true);
    expect(status.steps.webhookVerified).toBe(true);
    expect(status.steps.testMessage).toBe(false);
    expect(status.complete).toBe(false);
    expect(status.nextStep).toBe(3);
  });
});
