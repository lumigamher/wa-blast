"use server";

import { chatwootApi, type ChatwootConversation } from "@/lib/chatwoot";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

const MAX_PAGES = 60; // 60 × 25 = 1500 conversations máx por status

export type DuplicateGroup = {
  contactId: number;
  contactName: string | null;
  contactPhone: string | null;
  keepConvId: number;
  keepLastActivity: number;
  toResolveIds: number[];
};

export type AnalyzeResult =
  | {
      ok: true;
      groups: DuplicateGroup[];
      totalContactsAffected: number;
      totalToResolve: number;
      scannedConversations: number;
    }
  | { ok: false; error: string };

async function fetchActiveConversations(
  token: string,
  inboxId: number,
): Promise<ChatwootConversation[]> {
  const out: ChatwootConversation[] = [];
  for (const status of ["open", "pending"] as const) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await chatwootApi.listConversations(token, {
        status,
        inboxId,
        page,
      });
      const list = res.data?.payload ?? [];
      if (list.length === 0) break;
      out.push(...list);
      if (list.length < 25) break;
    }
  }
  return out;
}

function groupDuplicates(
  conversations: ChatwootConversation[],
): DuplicateGroup[] {
  const byContact = new Map<number, ChatwootConversation[]>();
  for (const c of conversations) {
    const cid = c.meta.sender?.id;
    if (!cid) continue;
    const arr = byContact.get(cid) ?? [];
    arr.push(c);
    byContact.set(cid, arr);
  }

  const groups: DuplicateGroup[] = [];
  for (const [cid, convs] of byContact) {
    if (convs.length < 2) continue;
    convs.sort(
      (a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0),
    );
    const [keep, ...rest] = convs;
    groups.push({
      contactId: cid,
      contactName: keep.meta.sender?.name ?? null,
      contactPhone: keep.meta.sender?.phone_number ?? null,
      keepConvId: keep.id,
      keepLastActivity: keep.last_activity_at ?? 0,
      toResolveIds: rest.map((c) => c.id),
    });
  }
  groups.sort((a, b) => b.toResolveIds.length - a.toResolveIds.length);
  return groups;
}

export async function analyzeDuplicatesAction(): Promise<AnalyzeResult> {
  const session = await getSession();
  if (!session.user) return { ok: false, error: "No autenticado" };

  try {
    const convs = await fetchActiveConversations(
      session.user.chatwootToken,
      env.CHATWOOT_INBOX_ID,
    );
    const groups = groupDuplicates(convs);
    return {
      ok: true,
      groups,
      totalContactsAffected: groups.length,
      totalToResolve: groups.reduce((a, g) => a + g.toResolveIds.length, 0),
      scannedConversations: convs.length,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ResolveOneResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resolveOneConversationAction(
  conversationId: number,
): Promise<ResolveOneResult> {
  const session = await getSession();
  if (!session.user) return { ok: false, error: "No autenticado" };
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return { ok: false, error: "ID inválido" };
  }
  try {
    await chatwootApi.toggleConversationStatus(
      session.user.chatwootToken,
      conversationId,
      "resolved",
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
