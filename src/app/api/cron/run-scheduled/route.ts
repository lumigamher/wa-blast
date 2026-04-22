import { NextResponse } from "next/server";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns } from "@/lib/db/schema";
import { getWorker } from "@/lib/campaigns/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const ids: string[] = [];
  for (const c of due) {
    await db.update(campaigns).set({ status: "queued" }).where(eq(campaigns.id, c.id));
    void getWorker(db)
      .runCampaign(c.id)
      .catch((e) => console.error("scheduled sender error", c.id, e));
    ids.push(c.id);
  }

  return NextResponse.json({ ok: true, triggered: ids });
}
