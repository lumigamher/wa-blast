import { and, eq, ne } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaigns, organizationSettings } from "@/lib/db/schema";

export type OnboardingStatus = {
  steps: {
    creds: boolean;
    credsVerified: boolean;
    webhookVerified: boolean;
    testMessage: boolean;
    firstCampaign: boolean;
  };
  complete: boolean;
  nextStep: 1 | 2 | 3 | 4 | null;
};

export async function getOnboardingStatus(
  db: DB,
  orgId: string,
): Promise<OnboardingStatus> {
  const [row] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.orgId, orgId));

  if (!row) {
    throw new Error(`No settings for org ${orgId}`);
  }

  // Check if all required creds are present
  const creds = !!(
    row.metaPhoneId &&
    row.metaWabaId &&
    row.metaAppId &&
    row.metaAccessTokenEnc &&
    row.metaAppSecretEnc
  );

  // Creds verified means creds present AND metaVerifiedAt is set
  const credsVerified = creds && !!row.metaVerifiedAt;

  // Webhook verified means webhookVerifiedAt is set
  const webhookVerified = !!row.webhookVerifiedAt;

  // Test message sent means testMessageSentAt is set
  const testMessage = !!row.testMessageSentAt;

  // First campaign means exists at least one campaign with status != "draft"
  const [camp] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), ne(campaigns.status, "draft")))
    .limit(1);
  const firstCampaign = !!camp;

  const steps = {
    creds,
    credsVerified,
    webhookVerified,
    testMessage,
    firstCampaign,
  };

  const complete = Object.values(steps).every(Boolean);

  // Next step logic: follow the flow 1→2→3→4
  const nextStep =
    !credsVerified
      ? 1
      : !webhookVerified
        ? 2
        : !testMessage
          ? 3
          : !firstCampaign
            ? 4
            : null;

  return {
    steps,
    complete,
    nextStep: complete ? null : nextStep,
  };
}
