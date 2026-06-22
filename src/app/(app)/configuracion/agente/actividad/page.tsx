import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { agentRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { AgentActivity } from "../_activity";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const { orgId } = await requireOrg();

  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.orgId, orgId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(10);

  return <AgentActivity runs={runs} />;
}
