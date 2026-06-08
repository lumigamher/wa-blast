import { eq } from "drizzle-orm";
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
    metaVerifyToken: string;
  },
) {
  await db
    .update(organizationSettings)
    .set({
      metaPhoneId: input.metaPhoneId,
      metaWabaId: input.metaWabaId,
      metaAppId: input.metaAppId,
      metaAccessTokenEnc: encrypt(input.metaAccessToken),
      metaAppSecretEnc: encrypt(input.metaAppSecret),
      metaVerifyToken: input.metaVerifyToken,
      updatedAt: new Date(),
    })
    .where(eq(organizationSettings.orgId, orgId));
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
