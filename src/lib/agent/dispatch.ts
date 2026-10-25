import type { Recipient } from "@/lib/meta/recipient";
import { markRead } from "@/lib/meta/client";
import { credsFromSettings } from "@/lib/meta/graph";
import type { DB } from "@/lib/db/client";
import { getOrgSettings } from "@/lib/org/settings";
import { getAgentConfig } from "./config";
import { isPaused, setAgentTyping } from "./pause";
import { type AgentJob, enqueueAgentTurn } from "./queue";
import { and, desc, eq } from "drizzle-orm";
import { messages } from "@/lib/db/schema";

const DEBOUNCE_MS = Number(process.env.AGENT_DEBOUNCE_MS ?? 8000);

type EnqueueFn = (db: DB, job: AgentJob, delayMs: number) => void;

export async function maybeDispatchAgentTurn(
  db: DB,
  orgId: string,
  conversationId: string,
  recipient: string | Recipient,
  deps?: { enqueue?: EnqueueFn },
): Promise<void> {
  const config = await getAgentConfig(db, orgId);
  if (!config.enabled) return;
  if (await isPaused(db, conversationId)) return;

  // Primero los dos chequeos de arriba, después el typing. Mostrar "escribiendo…" de inmediato (cubre el debounce + el turno).
  try {
    const settings = await getOrgSettings(db, orgId);
    const creds = credsFromSettings(settings);
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
    if (lastInbound[0]?.wamid && creds) {
      await markRead(settings, { wamid: lastInbound[0].wamid, typing: true }).catch(() => {});
    }
    await setAgentTyping(db, conversationId, new Date(Date.now() + 30_000)).catch(() => {});
  } catch {
    // No romper el dispatch si falla el typing inicial
  }

  // Durable: la fila en agent_jobs sobrevive a un reinicio; el cron la barre.
  const enqueue = deps?.enqueue ?? enqueueAgentTurn;
  enqueue(db, { orgId, conversationId, recipient }, DEBOUNCE_MS);
}
