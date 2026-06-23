import { sendText } from "@/lib/meta/client";
import { credsFromSettings } from "@/lib/meta/graph";
import { db as defaultDb } from "@/lib/db/client";
import type { DB } from "@/lib/db/client";
import { getOrgSettings } from "@/lib/org/settings";
import { getAgentConfig } from "./config";
import { isPaused } from "./pause";
import { enqueueAgentTurn } from "./queue";
import { type AgentSender, runAgentTurn } from "./turn";

const DEBOUNCE_MS = 6000;

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
  const enqueue = deps?.enqueue ?? enqueueAgentTurn;
  enqueue(conversationId, () => runRealTurn(orgId, conversationId, phone), DEBOUNCE_MS);
}

async function runRealTurn(orgId: string, conversationId: string, phone: string): Promise<void> {
  const settings = await getOrgSettings(defaultDb, orgId);
  const creds = credsFromSettings(settings);
  const sender: AgentSender = async ({ to, body }) => {
    if (!creds) return { wamid: null };
    const res = await sendText(settings, { to, body });
    return { wamid: "wamid" in res ? res.wamid : null };
  };
  await runAgentTurn(defaultDb, orgId, conversationId, {
    sender,
    to: phone,
  });
}
