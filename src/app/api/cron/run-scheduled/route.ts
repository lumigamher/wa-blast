import { NextResponse } from "next/server";
import { and, eq, inArray, lte, isNotNull, sql } from "drizzle-orm";
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
  // Timestamps en segundos (mode "timestamp"). Sin statusChangedAt (filas
  // anteriores al latido) se mide desde createdAt: una `queued` recién creada
  // no cuenta como vencida, y una vieja sí.
  const cutoffSec = Math.floor(cutoff.getTime() / 1000);
  const staleCond = and(
    // `queued` = reclamada pero el proceso murió antes de empezar.
    inArray(campaigns.status, ["sending", "queued"]),
    sql`coalesce(${campaigns.statusChangedAt}, ${campaigns.createdAt}) <= ${cutoffSec}`,
  );
  const candidates = await db.select({ id: campaigns.id }).from(campaigns).where(staleCond);

  const recovered: string[] = [];
  for (const { id } of candidates) {
    // Todo en UNA transacción síncrona: la campaña solo pasa a draft si SIGUE
    // vencida, y en la misma unidad se barren sus filas `sending` y se suma el
    // contador. Así un corte o un cron concurrente no deja filas huérfanas ni
    // marca como "interrumpidas" filas que un worker nuevo acaba de reservar.
    // Las filas `sending` no se reenvían solas (no sabemos si Meta las aceptó):
    // pasan a failed y se reintentan desde el botón existente. Las `pending` siguen.
    const ok = db.transaction((tx) => {
      const claimed = tx
        .update(campaigns)
        .set({ status: "draft", scheduledAt: new Date(), statusChangedAt: new Date() })
        .where(and(eq(campaigns.id, id), staleCond))
        .returning({ id: campaigns.id })
        .all();
      if (claimed.length === 0) return false;
      const interrupted = tx
        .update(campaignRecipients)
        .set({ status: "failed", error: INTERRUPTED_ERROR, sentAt: new Date() })
        .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.status, "sending")))
        .returning({ id: campaignRecipients.id })
        .all();
      if (interrupted.length > 0) {
        tx.update(campaigns)
          .set({ failed: sql`${campaigns.failed} + ${interrupted.length}` })
          .where(eq(campaigns.id, id))
          .run();
      }
      return true;
    });
    if (ok) recovered.push(id);
  }
  return recovered;
}

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // Campañas en su propio try: si la recuperación o el reclamo lanzan, el
  // barrido del agente igual corre y se responde con lo que alcanzó a salir.
  let recovered: string[] = [];
  const ids: string[] = [];
  try {
    // Recover stuck campaigns first, before selecting due campaigns
    recovered = await recoverStuckCampaigns(db);
    if (recovered.length > 0) {
      console.log("recovered stuck campaigns", recovered);
    }

    const now = new Date();
    const due = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.status, "draft"), isNotNull(campaigns.scheduledAt), lte(campaigns.scheduledAt, now)));

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
  } catch (e) {
    console.error("[cron] campaigns error", e);
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
