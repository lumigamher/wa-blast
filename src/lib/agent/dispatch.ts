import { sendText, markRead } from "@/lib/meta/client";
import { credsFromSettings } from "@/lib/meta/graph";
import { db as defaultDb } from "@/lib/db/client";
import type { DB } from "@/lib/db/client";
import { getOrgSettings } from "@/lib/org/settings";
import { getAgentConfig } from "./config";
import { isPaused, setAgentTyping } from "./pause";
import { enqueueAgentTurn } from "./queue";
import { type AgentSender, runAgentTurn } from "./turn";
import { and, desc, eq } from "drizzle-orm";
import { messages } from "@/lib/db/schema";

const DEBOUNCE_MS = Number(process.env.AGENT_DEBOUNCE_MS ?? 8000);

type EnqueueFn = (id: string, runner: () => Promise<void>, delayMs: number) => void;

export async function maybeDispatchAgentTurn(
  db: DB,
  orgId: string,
  conversationId: string,
  phone: string,
  deps?: { enqueue?: EnqueueFn },
): Promise<void> {
  const config = await getAgentConfig(db, orgId);
  if (!config.enabled) return;
  if (await isPaused(db, conversationId)) return;

  // Mostrar "escribiendo…" de inmediato (cubre el debounce + el turno).
  try {
    const settings = await getOrgSettings(db, orgId);
    const creds = credsFromSettings(settings);
    const lastInbound = await db
      .select({ wamid: messages.wamid })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, "in")))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (lastInbound[0]?.wamid && creds) {
      await markRead(settings, { wamid: lastInbound[0].wamid, typing: true }).catch(() => {});
    }
    await setAgentTyping(db, conversationId, new Date(Date.now() + 30_000)).catch(() => {});
  } catch {
    // No romper el dispatch si falla el typing inicial
  }

  const enqueue = deps?.enqueue ?? enqueueAgentTurn;
  enqueue(conversationId, () => runRealTurn(orgId, conversationId, phone), DEBOUNCE_MS);
}

async function runRealTurn(orgId: string, conversationId: string, phone: string): Promise<void> {
  const settings = await getOrgSettings(defaultDb, orgId);
  const creds = credsFromSettings(settings);
  const sender: AgentSender = async ({ to, body, replyTo }) => {
    if (!creds) return { wamid: null };
    const res = await sendText(settings, { to, body, replyTo });
    return { wamid: "wamid" in res ? res.wamid : null };
  };

  // Query last inbound wamid for typing indicator
  const lastInbound = await defaultDb
    .select({ wamid: messages.wamid })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, "in")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const lastInboundWamid = lastInbound[0]?.wamid;

  // Send typing indicator
  if (lastInboundWamid && creds) {
    await markRead(settings, { wamid: lastInboundWamid, typing: true }).catch(() => {});
  }

  // Set typing expiration
  await setAgentTyping(defaultDb, conversationId, new Date(Date.now() + 30_000)).catch(() => {});

  try {
    await runAgentTurn(defaultDb, orgId, conversationId, {
      sender,
      to: phone,
    });
  } finally {
    // Clear typing on success or error
    await setAgentTyping(defaultDb, conversationId, null).catch(() => {});
  }
}
