import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./server";
import { db } from "@/lib/db/client";
import { member } from "@/lib/db/schema";

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireOrg(): Promise<{ session: Session; orgId: string }> {
  const session = await requireSession();
  let orgId = session.session.activeOrganizationId;

  if (!orgId) {
    const [m] = await db.select().from(member).where(eq(member.userId, session.user.id)).limit(1);
    if (!m) redirect("/login");
    orgId = m.organizationId;
  }

  return { session, orgId };
}
