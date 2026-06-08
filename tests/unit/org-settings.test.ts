import { describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, organizationSettings } from "@/lib/db/schema";
import { getOrgSettings, saveMetaCreds } from "@/lib/org/settings";
import { credsFromSettings } from "@/lib/meta/graph";

describe("metaAppId per-org", () => {
  test("save + read + creds use org appId", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
    await db.insert(organizationSettings).values({ orgId: "o", updatedAt: new Date() });
    await saveMetaCreds(db, "o", {
      metaPhoneId: "p",
      metaWabaId: "w",
      metaAppId: "app1",
      metaAccessToken: "tok",
      metaAppSecret: "sec",
      metaVerifyToken: "vt",
    });
    const s = await getOrgSettings(db, "o");
    expect(s.metaAppId).toBe("app1");
    expect(credsFromSettings(s)?.appId).toBe("app1");
  });
});
