"use server";

import { randomBytes } from "node:crypto";
import { getOrgSettings } from "@/lib/org/settings";
import { db } from "@/lib/db/client";
import { organizationSettings } from "@/lib/db/schema";
import { credsFromSettings, getPhoneHealth } from "@/lib/meta/graph";
import { sendTemplate } from "@/lib/meta/client";
import { getOnboardingStatus, type OnboardingStatus } from "@/lib/onboarding/status";
import { requireOrg } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/contacts/phone";
import { eq } from "drizzle-orm";

const TEST_MESSAGE_MIN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export async function verifyMetaConnectionAction(): Promise<
  { ok: true; phone: string; name: string; quality: string } | { ok: false; message: string }
> {
  try {
    const { orgId } = await requireOrg();
    const settings = await getOrgSettings(db, orgId);
    const creds = credsFromSettings(settings);

    if (!creds) {
      return { ok: false, message: "Primero guarda las credenciales." };
    }

    const health = await getPhoneHealth(creds);

    // Stamp metaVerifiedAt
    await db
      .update(organizationSettings)
      .set({
        metaVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));

    return {
      ok: true,
      phone: health.display_phone_number,
      name: health.verified_name || "Sin nombre verificado",
      quality: health.quality_rating || "Sin calificación",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("401") || message.includes("Auth")) {
      return {
        ok: false,
        message: "Meta rechazó el token. Verifica que sea el token permanente del System User.",
      };
    }
    return { ok: false, message };
  }
}

export async function sendTestMessageAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { orgId } = await requireOrg();
    const settings = await getOrgSettings(db, orgId);
    const phone = formData.get("phone") as string;

    // Validate E.164 format
    const defaultCountry = settings.defaultCountry || "CO";
    const normalizedPhone = normalizePhone(phone, defaultCountry);
    if (!normalizedPhone) {
      return {
        ok: false,
        message: "Número de teléfono inválido. Usa formato E.164 (+57...).",
      };
    }

    // Check anti-spam: <2 minutes since last test
    if (settings.testMessageSentAt) {
      const timeSinceLastTest = Date.now() - settings.testMessageSentAt.getTime();
      if (timeSinceLastTest < TEST_MESSAGE_MIN_INTERVAL_MS) {
        return {
          ok: false,
          message: "Espera un momento antes de reenviar.",
        };
      }
    }

    // Send template
    const result = await sendTemplate(settings, {
      to: normalizedPhone,
      templateName: "hello_world",
      language: "en_US",
      components: [],
    });

    if ("error" in result) {
      return {
        ok: false,
        message: `Meta: ${result.error.message}`,
      };
    }

    // Stamp testMessageSentAt
    await db
      .update(organizationSettings)
      .set({
        testMessageSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));

    return {
      ok: true,
      message: "Revisa tu WhatsApp",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}

export async function getOnboardingStatusAction(): Promise<OnboardingStatus> {
  const { orgId } = await requireOrg();
  return getOnboardingStatus(db, orgId);
}

export async function ensureVerifyTokenAction(): Promise<{ url: string; token: string }> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);

  let token = settings.metaVerifyToken;
  if (!token) {
    token = randomBytes(16).toString("hex");
    await db
      .update(organizationSettings)
      .set({
        metaVerifyToken: token,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.orgId, orgId));
  }

  const baseUrl = process.env.BETTER_AUTH_URL ?? "https://luladev.com";
  const url = `${baseUrl}/api/webhook/meta`;

  return { url, token };
}
