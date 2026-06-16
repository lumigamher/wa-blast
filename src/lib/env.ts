import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default(".data/wa-blast.db"),
  MEDIA_DIR: z.string().default(".data/media"),
  PUBLIC_BASE_URL: z.string().url().optional(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),

  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32-byte base64"),

  DISABLE_SIGNUP: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_VERSION: z.string().default("v24.0"),
  TURN_URL: z.string().optional(),
  TURN_TLS_URL: z.string().optional(),
  TURN_SECRET: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),

  OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
  OPENAI_MODEL: z.string().optional(),

  EFIPAY_API_TOKEN: z.string().optional(),
  EFIPAY_OFFICE_ID: z.string().optional(),
  EFIPAY_WEBHOOK_TOKEN: z.string().optional(),
  EFIPAY_BASE_URL: z.string().url().default("https://sag.efipay.co/api/v1"),

  ADMIN_EMAILS: z.string().default(""),
});

export const env = schema.parse(process.env);
