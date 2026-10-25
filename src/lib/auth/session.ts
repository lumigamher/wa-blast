import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./server";
import { db } from "@/lib/db/client";
import { resolveOrgForUser } from "./resolve-org";

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
  const orgId = await resolveOrgForUser(db, session.user.id, session.session.activeOrganizationId);
  if (!orgId) redirect("/login");

  return { session, orgId };
}
