import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { agentTools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AgentTools } from "../_tools";

export const dynamic = "force-dynamic";

export default async function HerramientasPage() {
  const { orgId } = await requireOrg();

  const toolRows = await db.select().from(agentTools).where(eq(agentTools.orgId, orgId));
  const enabledMap = Object.fromEntries(
    toolRows.filter((t) => t.type === "builtin").map((t) => [t.key, t.enabled]),
  );

  return <AgentTools enabled={enabledMap} />;
}
