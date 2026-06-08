import { afterEach, describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, organization, organizationSettings, user } from "@/lib/db/schema";
import { InProcessSenderWorker } from "@/lib/campaigns/worker";
import { encrypt } from "@/lib/crypto/encrypt";
import type { ComponentPlan } from "@/lib/campaigns/component-plan";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("worker carousel send", () => {
  test("builds carousel payload from plan", async () => {
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
    const plan: ComponentPlan = {
      kind: "carousel",
      bodyVarKeys: ["body.1"],
      cards: [
        { headerFormat: "IMAGE", headerLink: "https://wa/media/a", bodyVarKeys: [], buttons: [] },
        { headerFormat: "IMAGE", headerLink: "https://wa/media/b", bodyVarKeys: [], buttons: [] },
      ],
    };
    await db.insert(campaigns).values({
      id: "camp",
      orgId: "o",
      name: "T",
      templateName: "promo",
      templateLanguage: "es",
      headerType: "NONE",
      templateType: "carousel",
      componentPlanJson: JSON.stringify(plan),
      source: "adhoc",
      status: "queued",
      total: 1,
      createdBy: "u",
      createdAt: new Date(),
    });
    await db.insert(campaignRecipients).values({
      campaignId: "camp",
      phone: "+57300",
      params: JSON.stringify({ "body.1": "Juan" }),
      status: "pending",
    });

    let sentBody: unknown = null;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }) as unknown as typeof fetch;

    await new InProcessSenderWorker(db).runCampaign("camp");

    const comps = (sentBody as Record<string, unknown>).template as Record<string, unknown>;
    const components = comps.components as Record<string, unknown>[];
    expect(components[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "Juan" }] });
    expect((components[1] as Record<string, unknown>).type).toBe("carousel");
    expect((components[1] as Record<string, unknown>).cards as unknown[]).toHaveLength(2);
  });
});
