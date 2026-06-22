import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getAgentConfig } from "@/lib/agent/config";
import { AgentForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function AgentePage() {
  const { orgId } = await requireOrg();

  const config = await getAgentConfig(db, orgId);

  return <AgentForm config={config} />;
}
