import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { member } from "@/lib/db/schema";

// Resuelve la org efectiva del usuario. La org activa de la sesión solo vale si
// el usuario sigue en `member`; si lo expulsaron, cae a su primera membresía.
export async function resolveOrgForUser(
  db: DB,
  userId: string,
  activeOrgId: string | null | undefined,
): Promise<string | null> {
  if (activeOrgId) {
    const [active] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, activeOrgId)))
      .limit(1);
    if (active) return active.organizationId;
  }
  const [first] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return first?.organizationId ?? null;
}
