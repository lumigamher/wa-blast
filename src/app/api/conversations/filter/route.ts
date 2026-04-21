import { NextResponse } from "next/server";
import { z } from "zod";
import { chatwootApi, type ChatwootConversation } from "@/lib/chatwoot";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_PAGES_PER_QUERY = 8; // 25 × 8 = 200 conversations per label/query
const MAX_RESULTS = 500;

const STATUSES = ["open", "resolved", "pending", "snoozed"] as const;

const querySchema = z.object({
  labels: z.array(z.string()).default([]),
  labelsMode: z.enum(["and", "or"]).default("or"),
  statuses: z.array(z.enum(STATUSES)).default(["open", "pending"]),
  sinceEpoch: z.number().int().nonnegative().optional(),
  untilEpoch: z.number().int().nonnegative().optional(),
  dateField: z.enum(["last_activity_at", "created_at"]).default(
    "last_activity_at",
  ),
  inboxId: z.number().int().positive().optional(),
});

type FilterPayload = z.infer<typeof querySchema>;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_params", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const filters = parsed.data;
  const token = session.user.chatwootToken;
  const inboxId = filters.inboxId ?? env.CHATWOOT_INBOX_ID;

  try {
    const conversations = await fetchFilteredConversations(
      token,
      { ...filters, inboxId },
    );

    const since = filters.sinceEpoch ?? null;
    const until = filters.untilEpoch ?? null;

    const filtered = conversations.filter((c) => {
      if (!filters.statuses.includes(c.status)) return false;
      const ts =
        filters.dateField === "created_at"
          ? c.created_at
          : c.last_activity_at;
      if (since != null && ts < since) return false;
      if (until != null && ts > until) return false;
      return true;
    });

    const byContact = new Map<number, typeof filtered[number]>();
    for (const c of filtered) {
      const cid = c.meta.sender?.id;
      if (!cid) continue;
      const existing = byContact.get(cid);
      if (
        !existing ||
        (c.last_activity_at ?? 0) > (existing.last_activity_at ?? 0)
      ) {
        byContact.set(cid, c);
      }
    }

    const capped = byContact.size > MAX_RESULTS;
    const entries = [...byContact.values()]
      .sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))
      .slice(0, MAX_RESULTS);

    const contacts = entries
      .map((c) => c.meta.sender)
      .filter((c) => c && c.phone_number);

    return NextResponse.json(
      {
        total: byContact.size,
        capped,
        contacts,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

async function fetchFilteredConversations(
  token: string,
  filters: FilterPayload & { inboxId: number },
): Promise<ChatwootConversation[]> {
  const { labels, labelsMode, inboxId } = filters;

  if (labels.length === 0) {
    return paginate(token, { inboxId });
  }

  if (labels.length === 1 || labelsMode === "or") {
    const perLabel = await Promise.all(
      labels.map((label) => paginate(token, { inboxId, labels: [label] })),
    );
    // union, dedupe by conv id
    const union = new Map<number, ChatwootConversation>();
    for (const list of perLabel) {
      for (const c of list) {
        if (!union.has(c.id)) union.set(c.id, c);
      }
    }
    return [...union.values()];
  }

  // AND mode: fetch each label, intersect by conv id
  const perLabel = await Promise.all(
    labels.map((label) => paginate(token, { inboxId, labels: [label] })),
  );
  if (perLabel.length === 0) return [];
  const [first, ...rest] = perLabel;
  const firstIds = new Set(first.map((c) => c.id));
  const commonIds = rest.reduce<Set<number>>((acc, list) => {
    const ids = new Set(list.map((c) => c.id));
    return new Set([...acc].filter((id) => ids.has(id)));
  }, firstIds);
  return first.filter((c) => commonIds.has(c.id));
}

async function paginate(
  token: string,
  opts: { inboxId: number; labels?: string[] },
): Promise<ChatwootConversation[]> {
  const out: ChatwootConversation[] = [];
  for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
    const res = await chatwootApi.listConversations(token, {
      status: "all",
      inboxId: opts.inboxId,
      labels: opts.labels,
      page,
    });
    const list = res.data?.payload ?? [];
    if (list.length === 0) break;
    out.push(...list);
    // Chatwoot page size = 25; if fewer we're done
    if (list.length < 25) break;
  }
  return out;
}
