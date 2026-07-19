import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { organization, organizationSettings, user } from "@/lib/db/schema";

// Lazy-load test DB to avoid better-sqlite3 at import time
let testDbInstance: ReturnType<typeof import("@/lib/db/test-db")["makeTestDb"]> | null = null;

async function getTestDb() {
  if (!testDbInstance) {
    const { makeTestDb } = await import("@/lib/db/test-db");
    testDbInstance = makeTestDb();
  }
  return testDbInstance;
}

// Mock auth session
vi.mock("@/lib/auth/session", () => ({
  requireOrg: vi.fn(async () => ({ orgId: "test-org", userId: "test-user" })),
}));

// Mock db client to use our single test instance
vi.mock("@/lib/db/client", async () => {
  const db = await getTestDb();
  return { db: db.db };
});

// Mock org settings to inject test credentials while keeping DB values for timestamps
vi.mock("@/lib/org/settings", async () => {
  const actual = await vi.importActual("@/lib/org/settings");
  const actualFns = actual as Record<string, unknown>;
  return {
    ...actualFns,
    getOrgSettings: vi.fn(async (db, orgId) => {
      const testDb = await getTestDb();
      // Read actual DB row to get real timestamps
      const [dbRow] = await testDb.db.select().from(organizationSettings).where(eq(organizationSettings.orgId, orgId));
      return {
        orgId,
        metaPhoneId: dbRow?.metaPhoneId || "PHONE_TEST_123",
        metaWabaId: dbRow?.metaWabaId || "WABA_TEST_456",
        metaAppId: dbRow?.metaAppId || "APP_TEST_789",
        metaAccessToken: "TEST_TOKEN",
        metaAppSecret: "TEST_SECRET",
        metaVerifyToken: dbRow?.metaVerifyToken || null,
        metaVerifiedAt: dbRow?.metaVerifiedAt || null,
        webhookVerifiedAt: dbRow?.webhookVerifiedAt || null,
        testMessageSentAt: dbRow?.testMessageSentAt || null,
        forwardUrl: dbRow?.forwardUrl || null,
        optoutKeywords: dbRow?.optoutKeywords ? JSON.parse(dbRow.optoutKeywords) : [],
        rateLimitMps: dbRow?.rateLimitMps || 1,
        defaultCountry: dbRow?.defaultCountry || "CO",
      };
    }),
  };
});

function mockFetchOk(responseBody: Record<string, unknown> = { success: true }) {
  const fn = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchError(status: number, responseBody: Record<string, unknown> = {}) {
  const fn = vi.fn(async () => new Response(JSON.stringify(responseBody), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function createPhoneFormData(phone: string): FormData {
  const fd = new FormData();
  fd.set("phone", phone);
  return fd;
}

async function setupTest() {
  const testDb = await getTestDb();
  const db = testDb.db;
  const orgId = "test-org";
  const userId = "test-user";

  // Create organization
  await db.insert(organization).values({
    id: orgId,
    name: "Test Org Conectar",
    slug: "test-org-conectar",
    createdAt: new Date(),
  });

  // Create user
  await db.insert(user).values({
    id: userId,
    email: "test-conectar@example.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create empty settings - getOrgSettings is mocked to return test values
  await db.insert(organizationSettings).values({
    orgId,
    updatedAt: new Date(),
  });

  return { db, orgId, userId };
}

describe("conectar wizard server actions", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    // Clean up test data for fresh start
    const testDb = await getTestDb();
    const db = testDb.db;
    await db.delete(organizationSettings).where(eq(organizationSettings.orgId, "test-org")).catch(() => {});
    await db.delete(user).where(eq(user.id, "test-user")).catch(() => {});
    await db.delete(organization).where(eq(organization.id, "test-org")).catch(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verifyMetaConnectionAction", () => {
    it("Graph OK → stamps metaVerifiedAt with current time, returns phone/name/quality", async () => {
      const { db, orgId } = await setupTest();

      mockFetchOk({
        id: "123456789",
        display_phone_number: "+573001234567",
        verified_name: "Test Business Verified",
        quality_rating: "GREEN",
      });

      const { verifyMetaConnectionAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await verifyMetaConnectionAction();

      expect(result).toEqual({
        ok: true,
        phone: "+573001234567",
        name: "Test Business Verified",
        quality: "GREEN",
      });

      // Verify metaVerifiedAt was stamped
      const [settings] = await db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.orgId, orgId));

      expect(settings.metaVerifiedAt).toBeTruthy();
      expect(settings.metaVerifiedAt).toBeInstanceOf(Date);
    });

    it("Graph 401 → returns ok:false, does not stamp metaVerifiedAt", async () => {
      const { db, orgId } = await setupTest();

      mockFetchError(401, { error: { message: "Invalid access token" } });

      const { verifyMetaConnectionAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await verifyMetaConnectionAction();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Should contain error message about Meta
        expect(result.message).toBeTruthy();
      }

      // Verify metaVerifiedAt was NOT stamped
      const [settings] = await db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.orgId, orgId));

      expect(settings.metaVerifiedAt).toBeNull();
    });

    it("Network error → returns ok:false with error message", async () => {
      await setupTest();

      const fetchFn = vi.fn(async () => {
        throw new Error("Network timeout");
      });
      vi.stubGlobal("fetch", fetchFn);

      const { verifyMetaConnectionAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await verifyMetaConnectionAction();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBeTruthy();
      }
    });
  });

  describe("sendTestMessageAction", () => {
    it("valid E.164 + wamid → stamps testMessageSentAt, returns ok:true", async () => {
      const { db, orgId } = await setupTest();

      mockFetchOk({
        messages: [{ id: "wamid.test.123" }],
      });

      const { sendTestMessageAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await sendTestMessageAction(createPhoneFormData("+573001234567"));

      expect(result).toEqual({ ok: true, message: expect.any(String) });

      // Verify testMessageSentAt was stamped
      const [settings] = await db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.orgId, orgId));

      expect(settings.testMessageSentAt).toBeTruthy();
      expect(settings.testMessageSentAt).toBeInstanceOf(Date);
    });

    it("re-called <2 min later → rejected with 'Espera un momento antes de reenviar.'", async () => {
      const { db, orgId } = await setupTest();

      // Stamp testMessageSentAt to 1 minute ago
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      await db
        .update(organizationSettings)
        .set({
          testMessageSentAt: oneMinuteAgo,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.orgId, orgId));

      mockFetchOk({
        messages: [{ id: "wamid.test.456" }],
      });

      const { sendTestMessageAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await sendTestMessageAction(createPhoneFormData("+573001234568"));

      expect(result).toEqual({
        ok: false,
        message: "Espera un momento antes de reenviar.",
      });

      // Verify testMessageSentAt was NOT updated
      const [settings] = await db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.orgId, orgId));

      // Compare timestamps with tolerance for DB rounding
      const timeDiff = Math.abs((settings.testMessageSentAt?.getTime() ?? 0) - oneMinuteAgo.getTime());
      expect(timeDiff).toBeLessThan(1000); // Allow 1 second difference for DB rounding
    });

    it("re-called ≥2 min later → allowed and updates timestamp", async () => {
      const { db, orgId } = await setupTest();

      // Stamp testMessageSentAt to 2+ minutes ago
      const twoMinutesAgo = new Date(Date.now() - 121 * 1000);
      await db
        .update(organizationSettings)
        .set({
          testMessageSentAt: twoMinutesAgo,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.orgId, orgId));

      mockFetchOk({
        messages: [{ id: "wamid.test.789" }],
      });

      const { sendTestMessageAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await sendTestMessageAction(createPhoneFormData("+573001234569"));

      expect(result.ok).toBe(true);

      // Verify testMessageSentAt was updated to now
      const [settings] = await db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.orgId, orgId));

      expect(settings.testMessageSentAt).not.toEqual(twoMinutesAgo);
      expect(settings.testMessageSentAt).toBeTruthy();
    });

    it("invalid phone (not E.164) → rejected", async () => {
      await setupTest();

      mockFetchOk({
        messages: [{ id: "wamid.test.999" }],
      });

      const { sendTestMessageAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await sendTestMessageAction(createPhoneFormData("not-a-number"));

      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it("empty phone → rejected", async () => {
      await setupTest();

      mockFetchOk({
        messages: [{ id: "wamid.test.999" }],
      });

      const { sendTestMessageAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await sendTestMessageAction(createPhoneFormData(""));

      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it("Meta sendMessage fails → returns error", async () => {
      await setupTest();

      mockFetchError(400, { error: { message: "Invalid phone number" } });

      const { sendTestMessageAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await sendTestMessageAction(createPhoneFormData("+573001234567"));

      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe("getOnboardingStatusAction", () => {
    it("returns proper OnboardingStatus shape", async () => {
      await setupTest();

      const { getOnboardingStatusAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await getOnboardingStatusAction();

      expect(result).toHaveProperty("steps");
      expect(result).toHaveProperty("complete");
      expect(result).toHaveProperty("nextStep");
      expect(result.steps).toHaveProperty("creds");
      expect(result.steps).toHaveProperty("credsVerified");
      expect(result.steps).toHaveProperty("webhookVerified");
      expect(result.steps).toHaveProperty("testMessage");
      expect(result.steps).toHaveProperty("firstCampaign");
    });

    it("auth integration works with requireOrg", async () => {
      await setupTest();

      const { getOnboardingStatusAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await getOnboardingStatusAction();

      // Should not throw and should return OnboardingStatus
      expect(result).toBeDefined();
    });
  });

  describe("ensureVerifyTokenAction", () => {
    it("null token → generates 32 hex chars, persists, returns URL with BETTER_AUTH_URL", async () => {
      const { db, orgId } = await setupTest();

      const { ensureVerifyTokenAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await ensureVerifyTokenAction();

      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("token");
      expect(result.token).toMatch(/^[a-f0-9]{32}$/);
      // URL should use BETTER_AUTH_URL env var or default to luladev.com
      expect(result.url).toMatch(/^https?:\/\/.*\/api\/webhook\/meta$/);
      expect(result.url).toContain("/api/webhook/meta");

      // Verify token was persisted
      const [settings] = await db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.orgId, orgId));

      expect(settings.metaVerifyToken).toBe(result.token);
    });

    it("existing token → returns it without regenerating", async () => {
      const { db, orgId } = await setupTest();

      const existingToken = "existing_token_abc123";
      await db
        .update(organizationSettings)
        .set({
          metaVerifyToken: existingToken,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.orgId, orgId));

      const { ensureVerifyTokenAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await ensureVerifyTokenAction();

      expect(result.token).toBe(existingToken);
    });

    it("URL includes BETTER_AUTH_URL env var or default", async () => {
      await setupTest();

      const { ensureVerifyTokenAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await ensureVerifyTokenAction();

      // Should use env or default to https://luladev.com
      expect(result.url).toMatch(/^https?:\/\/.*\/api\/webhook\/meta$/);
    });

    it("URL has proper webhook structure for Meta callback", async () => {
      await setupTest();

      const { ensureVerifyTokenAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await ensureVerifyTokenAction();

      expect(result.url).toContain("/api/webhook/meta");
    });

    it("called multiple times → returns same token (idempotent)", async () => {
      await setupTest();

      const { ensureVerifyTokenAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result1 = await ensureVerifyTokenAction();
      const result2 = await ensureVerifyTokenAction();

      expect(result1.token).toBe(result2.token);
      expect(result1.url).toBe(result2.url);
    });

    it("handles auth correctly via requireOrg", async () => {
      await setupTest();

      const { ensureVerifyTokenAction } = await import(
        "@/app/(app)/conectar/actions"
      );

      const result = await ensureVerifyTokenAction();

      expect(result).toBeDefined();
      expect(result.token).toBeTruthy();
    });
  });
});
