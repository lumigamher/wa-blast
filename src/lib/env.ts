import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default(".data/wa-blast.db"),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),

  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32-byte base64"),

  DISABLE_SIGNUP: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
});

export const env = schema.parse(process.env);
