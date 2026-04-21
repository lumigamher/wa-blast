import { z } from "zod";

const schema = z.object({
  CHATWOOT_BASE_URL: z.string().url(),
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
  CHATWOOT_INBOX_ID: z.coerce.number().int().positive(),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  META_WABA_ID: z.string().min(1).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_PHONE_NUMBER_ID: z.string().min(1).optional(),
  META_ACCESS_TOKEN: z.string().min(20).optional(),
  META_TIER_OVERRIDE: z.string().optional(),
});

export const env = schema.parse({
  CHATWOOT_BASE_URL: process.env.CHATWOOT_BASE_URL,
  CHATWOOT_ACCOUNT_ID: process.env.CHATWOOT_ACCOUNT_ID,
  CHATWOOT_INBOX_ID: process.env.CHATWOOT_INBOX_ID,
  SESSION_SECRET: process.env.SESSION_SECRET,
  APP_URL: process.env.APP_URL,
  META_WABA_ID: process.env.META_WABA_ID,
  META_APP_ID: process.env.META_APP_ID,
  META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID,
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
  META_TIER_OVERRIDE: process.env.META_TIER_OVERRIDE,
});

export function requireMetaConfig(): {
  wabaId: string;
  accessToken: string;
} {
  if (!env.META_WABA_ID || !env.META_ACCESS_TOKEN) {
    throw new Error(
      "META_WABA_ID y META_ACCESS_TOKEN deben configurarse en .env.local",
    );
  }
  return { wabaId: env.META_WABA_ID, accessToken: env.META_ACCESS_TOKEN };
}

export function requireMetaPhoneId(): string {
  if (!env.META_PHONE_NUMBER_ID) {
    throw new Error("META_PHONE_NUMBER_ID debe configurarse en .env.local");
  }
  return env.META_PHONE_NUMBER_ID;
}

export function requireMetaAppId(): string {
  if (!env.META_APP_ID) {
    throw new Error("META_APP_ID debe configurarse en .env.local");
  }
  return env.META_APP_ID;
}
