import type { DB } from "@/lib/db/client";
import { member, organization, organizationSettings } from "@/lib/db/schema";

export async function assignFirstUserToDefaultOrg(db: DB, userId: string) {
  const existing = await db.select().from(organization).limit(1);
  if (existing.length > 0) return;

  const orgId = `org_${crypto.randomUUID()}`;
  const now = new Date();
  await db.insert(organization).values({
    id: orgId,
    name: "Default",
    slug: "default",
    createdAt: now,
  });
  await db.insert(organizationSettings).values({
    orgId,
    updatedAt: now,
  });
  await db.insert(member).values({
    id: `mem_${crypto.randomUUID()}`,
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
  });
}
