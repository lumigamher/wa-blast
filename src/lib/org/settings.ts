import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { organizationSettings } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto/encrypt";

export type DecryptedSettings = {
  orgId: string;
  metaPhoneId: string | null;
  metaWabaId: string | null;
  metaAppId: string | null;
  metaAccessToken: string | null;
  metaAppSecret: string | null;
  metaVerifyToken: string | null;
  metaVerifiedAt: Date | null;
  webhookVerifiedAt: Date | null;
  testMessageSentAt: Date | null;
  forwardUrl: string | null;
  optoutKeywords: string[];
  rateLimitMps: number;
  defaultCountry: string;
};

export async function getOrgSettings(db: DB, orgId: string): Promise<DecryptedSettings> {
  const [row] = await db.select().from(organizationSettings).where(eq(organizationSettings.orgId, orgId));
  if (!row) throw new Error(`No settings for org ${orgId}`);
  return {
    orgId: row.orgId,
    metaPhoneId: row.metaPhoneId,
    metaWabaId: row.metaWabaId,
    metaAppId: row.metaAppId,
    metaAccessToken: row.metaAccessTokenEnc ? decrypt(row.metaAccessTokenEnc) : null,
    metaAppSecret: row.metaAppSecretEnc ? decrypt(row.metaAppSecretEnc) : null,
    metaVerifyToken: row.metaVerifyToken,
    metaVerifiedAt: row.metaVerifiedAt,
    webhookVerifiedAt: row.webhookVerifiedAt,
    testMessageSentAt: row.testMessageSentAt,
    forwardUrl: row.forwardUrl,
    optoutKeywords: JSON.parse(row.optoutKeywords) as string[],
    rateLimitMps: row.rateLimitMps,
    defaultCountry: row.defaultCountry,
  };
}

export async function saveMetaCreds(
  db: DB,
  orgId: string,
  input: {
    metaPhoneId: string;
    metaWabaId: string;
    metaAppId: string;
    metaAccessToken: string;
    metaAppSecret: string;
    metaVerifyToken?: string;
  },
) {
  const update: Record<string, unknown> = {
    metaPhoneId: input.metaPhoneId,
    metaWabaId: input.metaWabaId,
    metaAppId: input.metaAppId,
    metaAccessTokenEnc: encrypt(input.metaAccessToken),
    metaAppSecretEnc: encrypt(input.metaAppSecret),
    metaVerifiedAt: null,
    updatedAt: new Date(),
  };
  if (input.metaVerifyToken) {
    update.metaVerifyToken = input.metaVerifyToken;
  }
  await db.update(organizationSettings).set(update).where(eq(organizationSettings.orgId, orgId));
}

export async function saveForwardUrl(db: DB, orgId: string, url: string | null) {
  await db
    .update(organizationSettings)
    .set({ forwardUrl: url, updatedAt: new Date() })
    .where(eq(organizationSettings.orgId, orgId));
}

export async function saveOptoutKeywords(db: DB, orgId: string, keywords: string[]) {
  await db
    .update(organizationSettings)
    .set({ optoutKeywords: JSON.stringify(keywords), updatedAt: new Date() })
    .where(eq(organizationSettings.orgId, orgId));
}

export async function ensureVerifyToken(db: DB, orgId: string): Promise<string> {
  const row = (
    await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.orgId, orgId))
  )[0];
  if (row?.metaVerifyToken) return row.metaVerifyToken;
  const token = `lula_${randomBytes(8).toString("hex")}`;
  await db
    .update(organizationSettings)
    .set({ metaVerifyToken: token, updatedAt: new Date() })
    .where(eq(organizationSettings.orgId, orgId));
  return token;
}
