import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/resend";
import { createOrgForNewUser } from "./hooks";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        "Reset your Lula password",
        `<p>Click to reset: <a href="${url}">${url}</a></p>`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        user.email,
        "Verify your Lula email",
        `<p>Welcome! Verify your address: <a href="${url}">${url}</a></p>`,
      );
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      async sendInvitationEmail(data) {
        const url = `${env.BETTER_AUTH_URL}/aceptar-invitacion/${data.id}`;
        await sendEmail(
          data.email,
          `Te invitaron a ${data.organization.name} en Lula`,
          `<p>${data.inviter.user.name ?? data.inviter.user.email} te invitó a unirte a <b>${data.organization.name}</b> en Lula.</p>
           <p><a href="${url}">Aceptar invitación</a></p>
           <p style="color:#666;font-size:12px">Si no tienes cuenta, créala primero con este mismo correo y vuelve a abrir el enlace.</p>`,
        );
      },
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createOrgForNewUser(db, user);
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
