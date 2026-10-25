import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, organization, user } from "@/lib/db/schema";
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
