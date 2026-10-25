import { NextResponse } from "next/server";
import { and, eq, inArray, lte, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { campaignRecipients, campaigns } from "@/lib/db/schema";
import { getWorker } from "@/lib/campaigns/worker";
import { sweepAgentJobs } from "@/lib/agent/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El worker renueva el latido cada 15 s; 10 min sin latido = proceso muerto.
const STUCK_MS = 10 * 60 * 1000;
const INTERRUPTED_ERROR = "Envío interrumpido; revisa antes de reintentar";

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
        // `queued` = reclamada pero el proceso murió antes de empezar.
        inArray(campaigns.status, ["sending", "queued"]),
        or(isNull(campaigns.statusChangedAt), lte(campaigns.statusChangedAt, cutoff)),
      ),
    )
    .returning({ id: campaigns.id });

  // Filas en `sending`: el envío se interrumpió y no sabemos si Meta lo aceptó.
  // No se reenvían solas (riesgo de duplicado): pasan a failed y se pueden
  // reintentar desde el botón existente. Las `pending` siguen y el cron reanuda.
  for (const { id } of stuck) {
    const interrupted = await db
      .update(campaignRecipients)
      .set({ status: "failed", error: INTERRUPTED_ERROR, sentAt: new Date() })
      .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.status, "sending")))
      .returning({ id: campaignRecipients.id });
    if (interrupted.length > 0) {
      await db
        .update(campaigns)
        .set({ failed: sql`${campaigns.failed} + ${interrupted.length}` })
        .where(eq(campaigns.id, id));
    }
  }
  return stuck.map((s) => s.id);
}

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // Recover stuck campaigns first, before selecting due campaigns
  const recovered = await recoverStuckCampaigns(db);
  if (recovered.length > 0) {
    console.log("recovered stuck campaigns", recovered);
  }

  const now = new Date();
  const due = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.status, "draft"), isNotNull(campaigns.scheduledAt), lte(campaigns.scheduledAt, now)));

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

  // Turnos del agente vencidos sin timer (p. ej. tras un reinicio). No espera
  // los turnos; un fallo del barrido no debe tumbar el cron de campañas.
  let agentJobs = 0;
  try {
    agentJobs = await sweepAgentJobs(db, new Date());
  } catch (e) {
    console.error("[agent] sweep error", e);
  }

  return NextResponse.json({ ok: true, triggered: ids, recovered, agentJobs });
}
