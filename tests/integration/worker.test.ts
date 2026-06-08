import { afterEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, organization, organizationSettings, user } from "@/lib/db/schema";
import { InProcessSenderWorker } from "@/lib/campaigns/worker";
import { encrypt } from "@/lib/crypto/encrypt";

const realFetch = globalThis.fetch;
type FetchFn = typeof fetch;

function setFetch(fn: FetchFn) {
  globalThis.fetch = fn as unknown as typeof fetch;
}

async function seed() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  await db.insert(organizationSettings).values({
    orgId: "o",
    metaPhoneId: "111",
    metaAccessTokenEnc: encrypt("tok"),
    rateLimitMps: 100,
    updatedAt: new Date(),
  });
  await db.insert(user).values({ id: "u", email: "u@x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(campaigns).values({
    id: "camp",
    orgId: "o",
    name: "T",
    templateName: "promo",
    templateLanguage: "es",
    headerType: "NONE",
    source: "adhoc",
    status: "queued",
    total: 2,
    createdBy: "u",
    createdAt: new Date(),
  });
  await db.insert(campaignRecipients).values([
    { campaignId: "camp", phone: "+57300", params: "{}", status: "pending" },
    { campaignId: "camp", phone: "+57301", params: "{}", status: "pending" },
  ]);
  return db;
}

describe("InProcessSenderWorker", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("sends all recipients, updates counters, marks campaign done", async () => {
    const db = await seed();
    setFetch(
      (async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.AAA" }] }), { status: 200 })) as unknown as FetchFn,
    );

    const worker = new InProcessSenderWorker(db);
    await worker.runCampaign("camp");

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.status).toBe("done");
    expect(camp.sent).toBe(2);

    const recs = await db.select().from(campaignRecipients);
    expect(recs.every((r) => r.status === "sent")).toBe(true);
    expect(recs[0].wamid).toMatch(/^wamid/);
  });

  test("on Meta error, marks recipient failed and increments failed counter", async () => {
    const db = await seed();
    let call = 0;
    setFetch((async () => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({ error: { code: 131008, message: "Bad number" } }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 });
    }) as unknown as FetchFn);

    const worker = new InProcessSenderWorker(db);
    await worker.runCampaign("camp");

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.sent).toBe(1);
    expect(camp.failed).toBe(1);
  });
});
