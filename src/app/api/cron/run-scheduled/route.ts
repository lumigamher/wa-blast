import { NextResponse } from "next/server";
import { and, eq, lte, isNotNull, isNull, or } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { campaigns } from "@/lib/db/schema";
import { getWorker } from "@/lib/campaigns/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STUCK_MS = 2 * 3600 * 1000;

export async function claimDueCampaign(db: DB, id: string): Promise<boolean> {
  const claimed = await db
    .update(campaigns)
    .set({ status: "queued", statusChangedAt: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.status, "draft")))
    .returning({ id: campaigns.id });
  return claimed.length > 0;
}

export async function recoverStuckCampaigns(db: DB): Promise<string[]> {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const stuck = await db
    .update(campaigns)
    .set({ status: "draft", scheduledAt: new Date(), statusChangedAt: new Date() })
    .where(
      and(
        eq(campaigns.status, "sending"),
        or(isNull(campaigns.statusChangedAt), lte(campaigns.statusChangedAt, cutoff)),
      ),
    )
    .returning({ id: campaigns.id });
  return stuck.map((s) => s.id);
}

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const now = new Date();
  const due = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.status, "draft"), isNotNull(campaigns.scheduledAt), lte(campaigns.scheduledAt, now)));

  // Recover stuck campaigns first
  const recovered = await recoverStuckCampaigns(db);
  if (recovered.length > 0) {
    console.log("recovered stuck campaigns", recovered);
  }

  const ids: string[] = [];
  for (const c of due) {
    // Atomically claim campaign (only if still draft)
    if (!(await claimDueCampaign(db, c.id))) {
      continue;
    }
    void getWorker(db)
      .runCampaign(c.id)
      .catch((e) => console.error("scheduled sender error", c.id, e));
    ids.push(c.id);
  }

  return NextResponse.json({ ok: true, triggered: ids, recovered });
}
