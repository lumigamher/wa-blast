import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getShippingConfig } from "@/lib/agent/integrations/shipping/config";
import { AgentShipping } from "./_shipping";

export const dynamic = "force-dynamic";

export default async function EnviosPage() {
  const { orgId } = await requireOrg();
  const cfg = await getShippingConfig(db, orgId);

  return (
    <AgentShipping
      provider={(cfg?.provider ?? "manual") as "mipaquete" | "manual"}
      originCityName={String(cfg?.config.originCityName ?? "")}
      originCityCode={String(cfg?.config.originCityCode ?? "")}
      volumetricFactor={Number(cfg?.config.volumetricFactor) || 2500}
      hasApiKey={!!cfg?.credentials.apiKey}
      ratesJson={JSON.stringify((cfg?.config.rates as unknown[]) ?? [], null, 2)}
    />
  );
}
