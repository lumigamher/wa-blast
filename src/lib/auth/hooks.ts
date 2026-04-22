import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { member, organization, organizationSettings } from "@/lib/db/schema";

export async function assignFirstUserToDefaultOrg(db: DB, userId: string) {
  const existing = await db.select().from(organization).limit(1);
  const now = new Date();

  if (existing.length === 0) {
    const orgId = `org_${crypto.randomUUID()}`;
    await db.insert(organization).values({ id: orgId, name: "Default", slug: "default", createdAt: now });
    await db.insert(organizationSettings).values({ orgId, updatedAt: now });
    await db.insert(member).values({
      id: `mem_${crypto.randomUUID()}`,
      organizationId: orgId,
      userId,
      role: "owner",
      createdAt: now,
    });
    return;
  }

  const existingMembership = await db.select().from(member).where(eq(member.userId, userId)).limit(1);
  if (existingMembership.length > 0) return;

  await db.insert(member).values({
    id: `mem_${crypto.randomUUID()}`,
    organizationId: existing[0].id,
    userId,
    role: "member",
    createdAt: now,
  });
}
