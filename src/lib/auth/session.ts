import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./server";

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
  const orgId = session.session.activeOrganizationId;
  if (!orgId) redirect("/login");
  return { session, orgId };
}
