import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import { Wizard } from "./_components/wizard";
import { ensureVerifyTokenAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConectarPage() {
  const { orgId } = await requireOrg();
  const initialStatus = await getOnboardingStatus(db, orgId);
  const webhook = await ensureVerifyTokenAction();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Conectar WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Te guiamos paso a paso para activar tu número de WhatsApp Business.
        </p>
      </header>

      <Wizard initialStatus={initialStatus} webhook={webhook} />
    </div>
  );
}
