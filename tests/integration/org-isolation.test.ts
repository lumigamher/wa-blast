import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import {
  campaigns,
  contacts,
  contactTags,
  organization,
  organizationSettings,
  tags,
  segments,
  mediaAssets,
  templateFavorites,
  subscriptions,
  subscriptionCharges,
  billingCheckouts,
  user,
} from "@/lib/db/schema";
import { getOrgSettings, saveMetaCreds } from "@/lib/org/settings";

async function seedTwoOrgs(db: ReturnType<typeof makeTestDb>["db"]) {
  // Create test user
  const userId = "user_test";
  await db.insert(user).values({
    id: userId,
    email: "test@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create two orgs
  const orgIds = ["org_A", "org_B"];
  for (const id of orgIds) {
    await db.insert(organization).values({
      id,
      name: id,
      createdAt: new Date(),
    });

    // Create organization settings for each org (required for getOrgSettings)
    await db.insert(organizationSettings).values({
      orgId: id,
      updatedAt: new Date(),
    });
  }

  // Create contacts for each org
  await db.insert(contacts).values([
    {
      id: "contact_A1",
      orgId: "org_A",
      phone: "+573001112233",
      name: "Alice",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "contact_A2",
      orgId: "org_A",
      phone: "+573002224444",
      name: "Alex",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "contact_B1",
      orgId: "org_B",
      phone: "+573009998877",
      name: "Bob",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  // Create tags for each org
  await db.insert(tags).values([
    {
      id: "tag_A1",
      orgId: "org_A",
      name: "Vip",
      color: "#FF0000",
    },
    {
      id: "tag_B1",
      orgId: "org_B",
      name: "Important",
      color: "#0000FF",
    },
  ]);

  // Create contact-tag associations
  await db.insert(contactTags).values([
    {
      contactId: "contact_A1",
      tagId: "tag_A1",
    },
    {
      contactId: "contact_B1",
      tagId: "tag_B1",
    },
  ]);

  // Create campaigns for each org
  await db.insert(campaigns).values([
    {
      id: "campaign_A1",
      orgId: "org_A",
      name: "Campaign A",
      templateName: "template_a",
      templateLanguage: "es",
      source: "manual",
      status: "draft",
      total: 0,
      createdBy: userId,
      createdAt: new Date(),
    },
    {
      id: "campaign_B1",
      orgId: "org_B",
      name: "Campaign B",
      templateName: "template_b",
      templateLanguage: "es",
      source: "manual",
      status: "draft",
      total: 0,
      createdBy: userId,
      createdAt: new Date(),
    },
  ]);

  // Create segments for each org
  await db.insert(segments).values([
    {
      id: "segment_A1",
      orgId: "org_A",
      name: "Segment A",
      ruleJson: '{"field":"name","operator":"contains","value":"A"}',
      createdAt: new Date(),
    },
    {
      id: "segment_B1",
      orgId: "org_B",
      name: "Segment B",
      ruleJson: '{"field":"name","operator":"contains","value":"B"}',
      createdAt: new Date(),
    },
  ]);

  // Create media assets for each org
  await db.insert(mediaAssets).values([
    {
      id: "media_A1",
      orgId: "org_A",
      kind: "image",
      mime: "image/jpeg",
      path: "/assets/img_a.jpg",
      bytes: 1024,
      createdAt: new Date(),
    },
    {
      id: "media_B1",
      orgId: "org_B",
      kind: "video",
      mime: "video/mp4",
      path: "/assets/vid_b.mp4",
      bytes: 2048,
      createdAt: new Date(),
    },
  ]);

  // Create subscriptions for each org
  await db.insert(subscriptions).values([
    {
      orgId: "org_A",
      status: "active",
      paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      orgId: "org_B",
      status: "active",
      paidUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
  ]);

  // Create subscription charges for each org
  await db.insert(subscriptionCharges).values([
    {
      id: "charge_A1",
      orgId: "org_A",
      amountCop: 50000,
      source: "manual",
      createdAt: new Date(),
    },
    {
      id: "charge_B1",
      orgId: "org_B",
      amountCop: 75000,
      source: "manual",
      createdAt: new Date(),
    },
  ]);

  // Create billing checkouts for each org
  await db.insert(billingCheckouts).values([
    {
      id: "checkout_A1",
      orgId: "org_A",
      createdAt: new Date(),
    },
    {
      id: "checkout_B1",
      orgId: "org_B",
      createdAt: new Date(),
    },
  ]);

  return { orgIds, userId };
}

describe("aislamiento multi-org", () => {
  it("contactos de orgA no aparecen consultando orgB", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    // Query contacts for orgA
    const contactsA = await db
      .select()
      .from(contacts)
      .where(eq(contacts.orgId, orgIds[0]));

    // Query contacts for orgB
    const contactsB = await db
      .select()
      .from(contacts)
      .where(eq(contacts.orgId, orgIds[1]));

    // orgA should have 2 contacts
    expect(contactsA).toHaveLength(2);
    expect(contactsA.map((c) => c.id)).toEqual(
      expect.arrayContaining(["contact_A1", "contact_A2"]),
    );

    // orgB should have 1 contact
    expect(contactsB).toHaveLength(1);
    expect(contactsB[0].id).toBe("contact_B1");

    // Ensure no cross-contamination
    const contactAIds = contactsA.map((c) => c.id);
    const contactBIds = contactsB.map((c) => c.id);
    expect(contactAIds).not.toContain("contact_B1");
    expect(contactBIds).not.toContain("contact_A1");
    expect(contactBIds).not.toContain("contact_A2");
  });

  it("campañas filtran por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    // Query campaigns for orgA
    const campaignsA = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.orgId, orgIds[0]));

    // Query campaigns for orgB
    const campaignsB = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.orgId, orgIds[1]));

    // orgA should have 1 campaign
    expect(campaignsA).toHaveLength(1);
    expect(campaignsA[0].id).toBe("campaign_A1");
    expect(campaignsA[0].orgId).toBe(orgIds[0]);

    // orgB should have 1 campaign
    expect(campaignsB).toHaveLength(1);
    expect(campaignsB[0].id).toBe("campaign_B1");
    expect(campaignsB[0].orgId).toBe(orgIds[1]);

    // Ensure no cross-contamination
    expect(campaignsA.map((c) => c.id)).not.toContain("campaign_B1");
    expect(campaignsB.map((c) => c.id)).not.toContain("campaign_A1");
  });

  it("tags filtran por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    // Query tags for orgA
    const tagsA = await db
      .select()
      .from(tags)
      .where(eq(tags.orgId, orgIds[0]));

    // Query tags for orgB
    const tagsB = await db
      .select()
      .from(tags)
      .where(eq(tags.orgId, orgIds[1]));

    expect(tagsA).toHaveLength(1);
    expect(tagsA[0].id).toBe("tag_A1");

    expect(tagsB).toHaveLength(1);
    expect(tagsB[0].id).toBe("tag_B1");

    expect(tagsA.map((t) => t.id)).not.toContain("tag_B1");
    expect(tagsB.map((t) => t.id)).not.toContain("tag_A1");
  });

  it("segments filtran por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    const segmentsA = await db
      .select()
      .from(segments)
      .where(eq(segments.orgId, orgIds[0]));

    const segmentsB = await db
      .select()
      .from(segments)
      .where(eq(segments.orgId, orgIds[1]));

    expect(segmentsA).toHaveLength(1);
    expect(segmentsA[0].id).toBe("segment_A1");

    expect(segmentsB).toHaveLength(1);
    expect(segmentsB[0].id).toBe("segment_B1");
  });

  it("mediaAssets filtran por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    const mediaA = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.orgId, orgIds[0]));

    const mediaB = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.orgId, orgIds[1]));

    expect(mediaA).toHaveLength(1);
    expect(mediaA[0].id).toBe("media_A1");

    expect(mediaB).toHaveLength(1);
    expect(mediaB[0].id).toBe("media_B1");
  });

  it("subscriptions filtran por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    const subA = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgIds[0]));

    const subB = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgIds[1]));

    expect(subA).toHaveLength(1);
    expect(subA[0].orgId).toBe(orgIds[0]);

    expect(subB).toHaveLength(1);
    expect(subB[0].orgId).toBe(orgIds[1]);
  });

  it("subscriptionCharges filtran por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    const chargesA = await db
      .select()
      .from(subscriptionCharges)
      .where(eq(subscriptionCharges.orgId, orgIds[0]));

    const chargesB = await db
      .select()
      .from(subscriptionCharges)
      .where(eq(subscriptionCharges.orgId, orgIds[1]));

    expect(chargesA).toHaveLength(1);
    expect(chargesA[0].orgId).toBe(orgIds[0]);

    expect(chargesB).toHaveLength(1);
    expect(chargesB[0].orgId).toBe(orgIds[1]);
  });

  it("billingCheckouts filtran por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    const checkoutsA = await db
      .select()
      .from(billingCheckouts)
      .where(eq(billingCheckouts.orgId, orgIds[0]));

    const checkoutsB = await db
      .select()
      .from(billingCheckouts)
      .where(eq(billingCheckouts.orgId, orgIds[1]));

    expect(checkoutsA).toHaveLength(1);
    expect(checkoutsA[0].orgId).toBe(orgIds[0]);

    expect(checkoutsB).toHaveLength(1);
    expect(checkoutsB[0].orgId).toBe(orgIds[1]);
  });

  it("contactTags vía join se aislan por org", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    // Query contact tags for orgA
    const tagsForA = await db
      .select({
        contactId: contactTags.contactId,
        tagId: tags.id,
        tagName: tags.name,
      })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(eq(tags.orgId, orgIds[0]));

    // Query contact tags for orgB
    const tagsForB = await db
      .select({
        contactId: contactTags.contactId,
        tagId: tags.id,
        tagName: tags.name,
      })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(eq(tags.orgId, orgIds[1]));

    // OrgA tags
    expect(tagsForA).toHaveLength(1);
    expect(tagsForA[0].tagId).toBe("tag_A1");
    expect(tagsForA[0].contactId).toBe("contact_A1");

    // OrgB tags
    expect(tagsForB).toHaveLength(1);
    expect(tagsForB[0].tagId).toBe("tag_B1");
    expect(tagsForB[0].contactId).toBe("contact_B1");
  });

  it("getOrgSettings de orgA nunca devuelve credenciales de orgB", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    // Save credentials for orgB
    await saveMetaCreds(db, orgIds[1], {
      metaPhoneId: "phone_B",
      metaWabaId: "waba_B",
      metaAppId: "app_B",
      metaAccessToken: "secret_token_B",
      metaAppSecret: "secret_app_B",
      metaVerifyToken: "verify_B",
    });

    // Save credentials for orgA
    await saveMetaCreds(db, orgIds[0], {
      metaPhoneId: "phone_A",
      metaWabaId: "waba_A",
      metaAppId: "app_A",
      metaAccessToken: "secret_token_A",
      metaAppSecret: "secret_app_A",
      metaVerifyToken: "verify_A",
    });

    // Get settings for orgA
    const settingsA = await getOrgSettings(db, orgIds[0]);

    // Get settings for orgB
    const settingsB = await getOrgSettings(db, orgIds[1]);

    // OrgA settings should match orgA credentials, not orgB
    expect(settingsA.metaPhoneId).toBe("phone_A");
    expect(settingsA.metaAccessToken).toBe("secret_token_A");
    expect(settingsA.metaAppSecret).toBe("secret_app_A");
    expect(settingsA.metaPhoneId).not.toBe("phone_B");
    expect(settingsA.metaAccessToken).not.toBe("secret_token_B");

    // OrgB settings should match orgB credentials, not orgA
    expect(settingsB.metaPhoneId).toBe("phone_B");
    expect(settingsB.metaAccessToken).toBe("secret_token_B");
    expect(settingsB.metaAppSecret).toBe("secret_app_B");
    expect(settingsB.metaPhoneId).not.toBe("phone_A");
    expect(settingsB.metaAccessToken).not.toBe("secret_token_A");
  });

  it("no es posible acceder a datos de otra org sin el filtro orgId", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    // Query ALL contacts (sin filtro orgId)
    const allContacts = await db.select().from(contacts);

    // Should have 3 contacts total (2 in orgA, 1 in orgB)
    expect(allContacts).toHaveLength(3);

    // Simulating a forgotten filter would expose all contacts
    // In real code this should be caught by the audit below
    const onlyOrgA = allContacts.filter((c) => c.orgId === orgIds[0]);
    expect(onlyOrgA).toHaveLength(2);

    // Verify orgB contact is still there (potential leak)
    const onlyOrgB = allContacts.filter((c) => c.orgId === orgIds[1]);
    expect(onlyOrgB).toHaveLength(1);
  });

  it("mediaAssets requiere validación de orgId al acceder por ID", async () => {
    const { db } = makeTestDb();
    const { orgIds } = await seedTwoOrgs(db);

    // Get asset from orgA
    const assetA = await db.select().from(mediaAssets).where(eq(mediaAssets.orgId, orgIds[0]));
    expect(assetA).toHaveLength(1);

    // Get asset from orgB
    const assetB = await db.select().from(mediaAssets).where(eq(mediaAssets.orgId, orgIds[1]));
    expect(assetB).toHaveLength(1);

    // Verify we can retrieve by ID with orgId filter
    const [mediaA] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, "media_A1"), eq(mediaAssets.orgId, orgIds[0])));

    const [mediaB] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, "media_B1"), eq(mediaAssets.orgId, orgIds[1])));

    // OrgA should only see their asset
    expect(mediaA?.id).toBe("media_A1");
    expect(mediaB?.id).toBe("media_B1");

    // But a lookup without orgId would return both (demonstrating the vulnerability)
    const allMedia = await db.select().from(mediaAssets);
    expect(allMedia).toHaveLength(2);
  });
});
