import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto/encrypt";
import type { DB } from "@/lib/db/client";
import { agentCatalog } from "@/lib/db/schema";

export type CatalogConfig = {
  provider: "internal" | "http" | "shopify" | "medusa";
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export async function saveCatalogConfig(db: DB, orgId: string, input: CatalogConfig): Promise<void> {
  const now = new Date();
  const hasCreds = Object.keys(input.credentials).length > 0;
  const credentialsEnc = hasCreds ? encrypt(JSON.stringify(input.credentials)) : null;
  const configJson = JSON.stringify(input.config ?? {});
  await db
    .insert(agentCatalog)
    .values({ orgId, provider: input.provider, credentialsEnc, configJson, updatedAt: now })
    .onConflictDoUpdate({ target: agentCatalog.orgId, set: { provider: input.provider, credentialsEnc, configJson, updatedAt: now } });
}

export async function getCatalogConfig(db: DB, orgId: string): Promise<CatalogConfig | null> {
  const row = (await db.select().from(agentCatalog).where(eq(agentCatalog.orgId, orgId)))[0];
  if (!row) return null;
  let credentials: Record<string, string> = {};
  if (row.credentialsEnc) {
    try { credentials = JSON.parse(decrypt(row.credentialsEnc)); } catch { credentials = {}; }
  }
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(row.configJson); } catch { config = {}; }
  return { provider: row.provider, credentials, config };
}
