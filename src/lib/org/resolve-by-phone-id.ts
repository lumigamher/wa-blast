import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { organizationSettings } from "@/lib/db/schema";
import { getOrgSettings, type DecryptedSettings } from "./settings";

export async function resolveOrgByPhoneId(db: DB, phoneId: string): Promise<DecryptedSettings | null> {
  const [row] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.metaPhoneId, phoneId));
  if (!row) return null;
  return getOrgSettings(db, row.orgId);
}
