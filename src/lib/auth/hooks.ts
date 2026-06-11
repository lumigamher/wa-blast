import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { member, organization, organizationSettings } from "@/lib/db/schema";

function slugify(email: string): string {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return base || "org";
}

export async function createOrgForNewUser(
  db: DB,
  user: { id: string; email: string; name?: string | null },
): Promise<void> {
  const already = await db.select().from(member).where(eq(member.userId, user.id));
  if (already.length > 0) return;

  const base = slugify(user.email);
  let slug = base;
  for (let i = 2; ; i++) {
    const clash = await db.select().from(organization).where(eq(organization.slug, slug));
    if (clash.length === 0) break;
    slug = `${base}-${i}`;
  }

  const orgId = randomUUID();
  const now = new Date();
  await db.insert(organization).values({ id: orgId, name: user.name || base, slug, createdAt: now });
  await db.insert(organizationSettings).values({ orgId, updatedAt: now });
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: orgId,
    userId: user.id,
    role: "owner",
    createdAt: now,
  });
}
