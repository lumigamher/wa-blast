import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export function isAdminEmail(email: string, list = env.ADMIN_EMAILS): boolean {
  return list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

// 404 (no 403) para no revelar que /admin existe
export async function requireAdmin() {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) notFound();
  return session;
}
