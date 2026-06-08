import { describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, organizationSettings } from "@/lib/db/schema";
import { getOrgSettings, saveMetaCreds } from "@/lib/org/settings";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  const orgId = "org_test";
  await db.insert(organization).values({ id: orgId, name: "T", createdAt: new Date() });
  await db.insert(organizationSettings).values({ orgId, updatedAt: new Date() });
  return orgId;
}

describe("org settings", () => {
  test("saveMetaCreds stores encrypted tokens, getOrgSettings returns decrypted", async () => {
    const { db } = makeTestDb();
    const orgId = await seed(db);

    await saveMetaCreds(db, orgId, {
      metaPhoneId: "111",
      metaWabaId: "222",
      metaAppId: "333",
      metaAccessToken: "secret-token",
      metaAppSecret: "secret-app",
      metaVerifyToken: "v",
    });

    const got = await getOrgSettings(db, orgId);
    expect(got.metaPhoneId).toBe("111");
    expect(got.metaAccessToken).toBe("secret-token");
    expect(got.metaAppSecret).toBe("secret-app");

    const raw = await db.select().from(organizationSettings).limit(1);
    expect(raw[0].metaAccessTokenEnc).not.toBe("secret-token");
  });
});
