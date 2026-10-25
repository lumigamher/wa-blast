import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { markRead, sendText } from "@/lib/meta/client";
import { credsFromSettings } from "@/lib/meta/graph";
import { getOrgSettings } from "@/lib/org/settings";
import { setAgentTyping } from "./pause";
import type { AgentJob } from "./queue";
import { type AgentSender, runAgentTurn } from "./turn";

/**
 * Turno real del agente (LLM + envío por Meta). Se resuelve solo desde los
 * datos del job, así que lo puede correr el timer o el barrido del cron tras un
 * reinicio.
 */
export async function runRealTurn(db: DB, job: AgentJob): Promise<void> {
  const { orgId, conversationId, recipient } = job;
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  const sender: AgentSender = async ({ to, body, replyTo }) => {
    if (!creds) return { wamid: null };
    const res = await sendText(settings, { to, body, replyTo });
    return { wamid: "wamid" in res ? res.wamid : null };
  };

  // Último wamid entrante, para el indicador de "escribiendo…"
  const lastInbound = await db
    .select({ wamid: messages.wamid })
    .from(messages)
    .where(
      and(
        eq(messages.orgId, orgId),
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "in"),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const lastInboundWamid = lastInbound[0]?.wamid;

  if (lastInboundWamid && creds) {
    await markRead(settings, { wamid: lastInboundWamid, typing: true }).catch(() => {});
  }

  await setAgentTyping(db, conversationId, new Date(Date.now() + 30_000)).catch(() => {});

  try {
    await runAgentTurn(db, orgId, conversationId, { sender, to: recipient });
  } finally {
    // Limpiar "escribiendo…" con éxito o error
    await setAgentTyping(db, conversationId, null).catch(() => {});
  }
}
