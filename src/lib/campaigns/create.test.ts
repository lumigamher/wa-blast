import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, organization, user } from "@/lib/db/schema";
import { recoverStuckCampaigns } from "@/app/api/cron/run-scheduled/route";
import { createCampaign } from "./create";
import { failedRowsToRecipients } from "./retry";

const base = {
  orgId: "o1",
  createdBy: "u1",
  name: "c",
  templateName: "t",
  templateLanguage: "es",
  headerType: "NONE" as const,
  source: "adhoc" as const,
};

describe("createCampaign", () => {
  it("persiste el bsuid de un destinatario sin teléfono", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(user).values({ id: "u1", email: "u1@x.co", createdAt: new Date(), updatedAt: new Date() });
    const { campaignId } = await createCampaign(db, {
      ...base,
      recipients: [
        { phone: null, bsuid: "US.123", params: {} },
        { phone: "573001112233", params: {} },
      ],
    });
    const rows = await db.select().from(campaignRecipients).where(eq(campaignRecipients.campaignId, campaignId));
    expect(rows.find((r) => r.bsuid === "US.123")?.phone).toBeNull();
    expect(rows.find((r) => r.phone === "573001112233")?.bsuid).toBeNull();
  });

  it("una inmediata nace queued con statusChangedAt y el cron no la recupera", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(user).values({ id: "u1", email: "u1@x.co", createdAt: new Date(), updatedAt: new Date() });
    const { campaignId } = await createCampaign(db, { ...base, recipients: [{ phone: "573001112233", params: {} }] });
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(c.status).toBe("queued");
    expect(c.statusChangedAt).not.toBeNull();
    expect(await recoverStuckCampaigns(db)).toEqual([]);
  });

  it("una programada nace draft sin statusChangedAt", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(user).values({ id: "u1", email: "u1@x.co", createdAt: new Date(), updatedAt: new Date() });
    const { campaignId } = await createCampaign(db, {
      ...base,
      scheduledAt: new Date(Date.now() + 3600_000),
      recipients: [{ phone: "573001112233", params: {} }],
    });
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(c.status).toBe("draft");
    expect(c.statusChangedAt).toBeNull();
  });
});

describe("failedRowsToRecipients", () => {
  it("copia phone y bsuid de las filas fallidas", () => {
    const out = failedRowsToRecipients([
      { contactId: null, phone: null, bsuid: "US.9", name: "Ana", params: '{"1":"x"}' },
      { contactId: "c1", phone: "57300", bsuid: null, name: null, params: "{}" },
    ]);
    expect(out).toEqual([
      { contactId: undefined, phone: null, bsuid: "US.9", name: "Ana", params: { "1": "x" } },
      { contactId: "c1", phone: "57300", bsuid: null, name: null, params: {} },
    ]);
  });
});
