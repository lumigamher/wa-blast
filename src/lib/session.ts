import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { env } from "./env";

export type AppSession = {
  user?: {
    id: number;
    name: string;
    email: string;
    role: "agent" | "administrator";
    chatwootToken: string;
  };
};

export const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: "funes_blast_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  },
};

export async function getSession() {
  const jar = await cookies();
  return getIronSession<AppSession>(jar, sessionOptions);
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session.user || session.user.role !== "administrator") {
    return null;
  }
  return session.user;
}
